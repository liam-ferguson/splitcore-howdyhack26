// Browser OCR with one shared Tesseract worker. Recognition runs locally in a
// Web Worker; the first use downloads the public worker, core and English model.

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const MAX_EDGE = 2400;
/** Product choice: end an attempt after this long without any engine progress. */
export const WATCHDOG_MS = 45_000;

export const READ_FAILED = "Couldn't read this receipt. Try another image, paste the text, or edit the bill.";

/** @type {Promise<any>|null} */
let workerPromise = null;
let jobToken = 0;
/** @type {(m: any) => void} */
let currentLogger = () => {};

export class OcrError extends Error {
  /** @param {string} message @param {'unsupported'|'too-large'|'decode'|'empty'|'engine'|'timeout'} code */
  constructor(message, code) { super(message); this.code = code; }
}
export class CancelledError extends Error {
  constructor() { super('Scan cancelled'); this.code = 'cancelled'; }
}

/**
 * Check a chosen file before decoding it.
 * @param {File|Blob & {name?: string}} file
 */
export function checkFile(file) {
  const name = (file.name || '').toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    throw new OcrError('PDFs are not supported. Take a screenshot or photo of the receipt and choose that PNG or JPEG instead.', 'unsupported');
  }
  if (/heic|heif/.test(file.type) || /\.(heic|heif)$/.test(name)) {
    throw new OcrError('HEIC photos are not supported here. On iPhone, set Camera → Formats → Most Compatible, or share the photo as JPEG.', 'unsupported');
  }
  if (!ACCEPTED.includes(file.type)) {
    throw new OcrError('Choose a PNG, JPEG or WebP image of the receipt.', 'unsupported');
  }
  if (file.size > MAX_BYTES) throw new OcrError('This image is larger than 15 MB. Choose a smaller photo.', 'too-large');
}

/**
 * Decode, check dimensions, composite over white, limit size and rotate.
 * @param {Blob} blob
 * @param {{rotation?: number, grayscale?: boolean}} opts
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function prepareImage(blob, { rotation = 0, grayscale = false } = {}) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new OcrError('This image could not be opened. Try another photo.', 'decode');
  }
  try {
    const { width, height } = bitmap;
    if (!width || !height) throw new OcrError('This image is empty.', 'decode');
    if (width * height > MAX_PIXELS) throw new OcrError('This image is over 16 megapixels. Choose a smaller photo.', 'too-large');
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.round(width * scale), h = Math.round(height * scale);
    const quarter = ((rotation % 360) + 360) % 360 / 90;
    const canvas = document.createElement('canvas');
    canvas.width = quarter % 2 ? h : w;
    canvas.height = quarter % 2 ? w : h;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(quarter * Math.PI / 2);
    if (grayscale) ctx.filter = 'grayscale(1) contrast(1.15)';
    ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
    return canvas;
  } finally {
    bitmap.close?.();
  }
}

async function getWorker() {
  if (!workerPromise) {
    const promise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, { logger: m => currentLogger(m) });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' });
      return worker;
    })();
    workerPromise = promise;
    // If cancel/reset happened while creating, terminate once creation resolves.
    promise.then(w => { if (workerPromise !== promise) w.terminate().catch(() => {}); }, () => { if (workerPromise === promise) workerPromise = null; });
  }
  return workerPromise;
}

/** Terminate the worker and invalidate any pending job. */
export function cancelScan() {
  jobToken++;
  const p = workerPromise;
  workerPromise = null;
  currentLogger = () => {};
  if (p) p.then(w => w.terminate().catch(() => {}), () => {});
}

/** Warm the worker (downloads assets) without recognizing anything. */
export function warmUp() {
  return getWorker().then(() => true, () => false);
}

/**
 * Recognize text from an image. Only the latest job may resolve.
 * @param {Blob} blob
 * @param {{rotation?: number, grayscale?: boolean, onProgress?: (p: {status: string, progress: number|null}) => void}} opts
 * @returns {Promise<{text: string, ms: number}>}
 */
export async function scanImage(blob, { rotation = 0, grayscale = false, onProgress = () => {} } = {}) {
  const token = ++jobToken;
  const started = performance.now();
  const stale = () => token !== jobToken;
  onProgress({ status: 'Preparing image', progress: null });
  const canvas = await prepareImage(blob, { rotation, grayscale });
  if (stale()) throw new CancelledError();

  let timer = 0;
  /** @type {(e: Error) => void} */
  let fail = () => {};
  const watchdog = new Promise((_, reject) => { fail = reject; });
  const arm = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!stale()) { cancelScan(); fail(new OcrError(READ_FAILED, 'timeout')); }
    }, WATCHDOG_MS);
  };
  currentLogger = m => {
    if (stale()) return;
    arm();
    const recognizing = m.status === 'recognizing text';
    onProgress({ status: describe(m.status), progress: recognizing && typeof m.progress === 'number' ? m.progress : null });
  };
  arm();
  try {
    onProgress({ status: 'Loading OCR engine', progress: null });
    const work = (async () => {
      const worker = await getWorker();
      if (stale()) throw new CancelledError();
      return worker.recognize(canvas);
    })();
    work.catch(() => {}); // a cancelled worker may reject after the race settles
    const result = /** @type {any} */ (await Promise.race([work, watchdog]));
    if (stale()) throw new CancelledError();
    const text = String(result?.data?.text ?? '');
    if (!text.trim()) throw new OcrError(READ_FAILED, 'empty');
    return { text, ms: Math.round(performance.now() - started) };
  } catch (e) {
    if (stale() && !(e instanceof OcrError && e.code === 'timeout')) throw new CancelledError();
    if (e instanceof OcrError || e instanceof CancelledError) throw e;
    // Worker crash or model download error: drop the worker so a retry starts fresh.
    if (!stale()) cancelScan();
    throw new OcrError(READ_FAILED, 'engine');
  } finally {
    clearTimeout(timer);
  }
}

function describe(status) {
  switch (status) {
    case 'loading tesseract core': return 'Loading OCR engine';
    case 'initializing tesseract': return 'Starting OCR engine';
    case 'loading language traineddata': return 'Loading English model';
    case 'loading language traineddata (from cache)': return 'Loading English model (cached)';
    case 'initializing api': return 'Starting recognizer';
    case 'recognizing text': return 'Reading text';
    default: return status ? status[0].toUpperCase() + status.slice(1) : 'Working';
  }
}
