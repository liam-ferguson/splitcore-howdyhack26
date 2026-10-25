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
 * Decode, check dimensions, composite over white, resize, rotate and (optionally) clean up
 * the pixels for OCR.
 * - 'color': as photographed.
 * - 'enhanced': grayscale + contrast stretch (fixes dim or washed-out photos).
 * - 'binary': adaptive black/white threshold (fixes shadows and uneven lighting).
 * `upscale` enlarges small images so thin receipt digits (periods!) survive recognition.
 * @param {Blob} blob
 * @param {{rotation?: number, mode?: 'color'|'enhanced'|'binary', upscale?: boolean}} opts
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function prepareImage(blob, { rotation = 0, mode = 'color', upscale = false } = {}) {
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
    const longest = Math.max(width, height);
    const target = upscale && longest < UPSCALE_TO ? UPSCALE_TO : Math.min(longest, MAX_EDGE);
    const scale = target / longest;
    const w = Math.round(width * scale), h = Math.round(height * scale);
    const quarter = ((rotation % 360) + 360) % 360 / 90;
    const canvas = document.createElement('canvas');
    canvas.width = quarter % 2 ? h : w;
    canvas.height = quarter % 2 ? w : h;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: mode !== 'color' }));
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(quarter * Math.PI / 2);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (mode !== 'color') {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const gray = toGray(img.data);
      if (mode === 'enhanced') stretch(gray);
      else adaptiveThreshold(gray, canvas.width, canvas.height);
      for (let i = 0, j = 0; i < gray.length; i++, j += 4) { img.data[j] = img.data[j + 1] = img.data[j + 2] = gray[i]; img.data[j + 3] = 255; }
      ctx.putImageData(img, 0, 0);
    }
    return canvas;
  } finally {
    bitmap.close?.();
  }
}

const UPSCALE_TO = 2000;

function toGray(rgba) {
  const g = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  return g;
}

/** Stretch the 2nd–98th percentile range to full black–white. */
function stretch(g) {
  const hist = new Uint32Array(256);
  for (const v of g) hist[v]++;
  const lowCount = g.length * 0.02, highCount = g.length * 0.98;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lowCount) { lo = v; break; } }
  acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= highCount) { hi = v; break; } }
  if (hi - lo < 10) return;
  const k = 255 / (hi - lo);
  for (let i = 0; i < g.length; i++) g[i] = (g[i] - lo) * k;
}

/** Bradley–Roth adaptive threshold (integral image), robust to shadows across a receipt. */
function adaptiveThreshold(g, w, h) {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += g[(y - 1) * w + (x - 1)];
      integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row;
    }
  }
  const s = Math.max(15, Math.round(Math.min(w, h) / 16)), half = s >> 1, t = 0.15;
  const out = new Uint8ClampedArray(g.length);
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - half), y2 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half), x2 = Math.min(w - 1, x + half);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = integral[(y2 + 1) * (w + 1) + (x2 + 1)] - integral[y1 * (w + 1) + (x2 + 1)] - integral[(y2 + 1) * (w + 1) + x1] + integral[y1 * (w + 1) + x1];
      out[y * w + x] = g[y * w + x] * count <= sum * (1 - t) ? 0 : 255;
    }
  }
  g.set(out);
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
 * Recognize text from an image, trying up to three cleanup/layout passes. After each pass,
 * `evaluate(text)` scores the parsed result; the first pass whose receipt adds up wins,
 * otherwise the best-scoring pass is returned. Only the latest job may resolve.
 * @param {Blob} blob
 * @param {{rotation?: number, grayscale?: boolean, onProgress?: (p: {status: string, progress: number|null}) => void,
 *   evaluate?: (text: string) => {score: number, good: boolean}}} opts
 * @returns {Promise<{text: string, ms: number, passes: number}>}
 */
export async function scanImage(blob, { rotation = 0, grayscale = false, onProgress = () => {}, evaluate } = {}) {
  const token = ++jobToken;
  const started = performance.now();
  const stale = () => token !== jobToken;
  const passes = [
    { mode: 'enhanced', psm: '6', upscale: false },
    { mode: 'binary', psm: '6', upscale: true },
    { mode: 'enhanced', psm: '4', upscale: true },
  ];
  if (grayscale) passes.unshift(passes.splice(1, 1)[0]);
  let pass = 0;

  let timer = 0;
  /** @type {(e: Error) => void} */
  let fail = () => {};
  const watchdog = new Promise((_, reject) => { fail = reject; });
  watchdog.catch(() => {});
  const arm = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!stale()) { cancelScan(); fail(new OcrError(READ_FAILED, 'timeout')); }
    }, WATCHDOG_MS);
  };
  const label = s => (pass > 0 && s === 'Reading text' ? `Double-checking (pass ${pass + 1} of ${passes.length})` : s);
  currentLogger = m => {
    if (stale()) return;
    arm();
    const recognizing = m.status === 'recognizing text';
    onProgress({ status: label(describe(m.status)), progress: recognizing && typeof m.progress === 'number' ? m.progress : null });
  };
  arm();
  try {
    onProgress({ status: 'Preparing image', progress: null });
    /** @type {{text: string, score: number}|null} */
    let best = null;
    for (pass = 0; pass < passes.length; pass++) {
      const p = passes[pass];
      const canvas = await prepareImage(blob, { rotation, mode: p.mode, upscale: p.upscale });
      if (stale()) throw new CancelledError();
      if (pass === 0) onProgress({ status: 'Loading OCR engine', progress: null });
      const work = (async () => {
        const worker = await getWorker();
        if (stale()) throw new CancelledError();
        await worker.setParameters({ tessedit_pageseg_mode: p.psm });
        return worker.recognize(canvas);
      })();
      work.catch(() => {}); // a cancelled worker may reject after the race settles
      const result = /** @type {any} */ (await Promise.race([work, watchdog]));
      if (stale()) throw new CancelledError();
      const text = String(result?.data?.text ?? '');
      const verdict = evaluate ? evaluate(text) : { score: text.trim().length, good: !!text.trim() };
      if (!best || verdict.score > best.score) best = { text, score: verdict.score };
      if (verdict.good) break;
    }
    if (!best || !best.text.trim()) throw new OcrError(READ_FAILED, 'empty');
    return { text: best.text, ms: Math.round(performance.now() - started), passes: Math.min(pass + 1, passes.length) };
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
