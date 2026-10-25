import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { appReducer, initialState } from './state.js';
import { parseReceipt, emptyReceipt } from './domain/receipt.js';
import { allocateBill } from './domain/split.js';
import { matchMerchant } from './domain/rewards.js';
import { scanImage, cancelScan, checkFile, OcrError, CancelledError, READ_FAILED } from './services/ocr.js';
import * as storage from './services/storage.js';
import { BrandMark, Dialog, Icon, InvalidFields } from './components/ui.jsx';
import Snap from './components/Snap.jsx';
import Claim from './components/Claim.jsx';
import Settle from './components/Settle.jsx';
import { PointsRescuePanel } from './components/Rewards.jsx';

/** Raw text with lines marked by how the parser used them. */
function SourceText({ bill }) {
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const r = bill.receipt;
  const used = new Set([...r.items, ...r.discounts].map(x => norm(x.sourceLine || '')).filter(Boolean));
  const review = new Set(r.issues.map(i => norm(i.line || '')).filter(Boolean));
  for (const i of r.items) if (i.needsReview) review.add(norm(i.sourceLine || ''));
  for (const d of r.discounts) if (d.scope === 'unresolved') review.add(norm(d.sourceLine || ''));
  return (
    <>
      <p className="small muted legend"><span className="src-line src-used">Item or discount</span> <span className="src-line src-review">Needs review</span></p>
      <pre className="raw-text">
        {bill.source.rawText.split(/\r?\n/).map((line, n) => {
          const k = norm(line);
          const cls = review.has(k) ? 'src-review' : used.has(k) ? 'src-used' : '';
          return <span key={n} className={`src-line ${cls}`}>{line || ' '}{cls === 'src-review' && <span className="sr-only"> (needs review)</span>}</span>;
        })}
      </pre>
    </>
  );
}

const IDLE_SCAN ={ status: 'idle', stage: '', progress: null, error: '', fileName: '', canRetry: false, hasImage: false };

export default function App() {
  const [state, dispatchApp] = useReducer(appReducer, undefined, () => initialState());
  const mode = state.mode;
  const demo = mode === 'demo';
  const bill = /** @type {import('./state.js').Bill} */ (state[mode]);
  const dispatch = useCallback(a => dispatchApp(a), []);

  // ---- Preferences, reusable names, optional draft (all failure tolerant) ----
  const [prefs, setPrefs] = useState(() => ({ ...storage.loadPrefs(), saveFailed: false }));
  const [names, setNames] = useState(() => (storage.loadPrefs().rememberNames ? storage.loadNames() : []));
  const [draftAvailable, setDraftAvailable] = useState(() => storage.loadPrefs().rememberDraft && !!storage.loadDraft());
  const onPref = patch => {
    const next = { ...prefs, ...patch };
    const ok = storage.savePrefs(next);
    if (patch.rememberNames === false) { storage.clearNames(); }
    if (patch.rememberDraft === false) { storage.clearDraft(); setDraftAvailable(false); }
    setPrefs({ ...next, saveFailed: !ok });
    announce(ok ? 'Preference saved on this device.' : 'This browser blocked local storage; SplitCore keeps working in memory.');
  };
  useEffect(() => {
    if (demo || !prefs.rememberNames) return;
    const merged = [...new Set([...bill.diners.map(d => d.name), ...names])].slice(0, 30);
    if (merged.join('\u0000') !== names.join('\u0000')) { setNames(merged); storage.saveNames(merged); }
  }, [bill.diners, prefs.rememberNames, demo]);
  useEffect(() => {
    if (demo || !prefs.rememberDraft || !state.real.receipt.items.length) return;
    const ok = storage.saveDraft(state.real);
    if (ok !== !prefs.saveFailed) setPrefs(p => ({ ...p, saveFailed: !ok }));
  }, [state.real, prefs.rememberDraft, demo]);

  // ---- Live status announcements (polite, explicit events only) ----
  const [status, setStatus] = useState('');
  const announce = useCallback(m => { setStatus(''); requestAnimationFrame(() => setStatus(m)); }, []);

  // ---- Invalid-field registry blocks settlement while text is unparseable ----
  const [invalid, setInvalid] = useState(/** @type {Set<string>} */ (new Set()));
  const registry = useMemo(() => ({
    set: (id, bad) => setInvalid(prev => {
      if (prev.has(id) === bad) return prev;
      const n = new Set(prev); bad ? n.add(id) : n.delete(id); return n;
    }),
  }), []);

  // ---- Scanning. Image stays in memory only. ----
  const [scan, setScan] = useState(IDLE_SCAN);
  const image = useRef(/** @type {{blob: Blob, url: string, name: string, rotation: number}|null} */ (null));
  const [imageUrl, setImageUrl] = useState('');
  const scanMode = useRef(mode);
  const [pending, setPending] = useState(/** @type {any} */ (null));

  const setImage = (blob, name) => {
    if (image.current) URL.revokeObjectURL(image.current.url);
    const url = URL.createObjectURL(blob);
    image.current = { blob, url, name, rotation: 0 };
    setImageUrl(url);
  };
  useEffect(() => () => { cancelScan(); if (image.current) URL.revokeObjectURL(image.current.url); }, []);

  const deliver = (payload) => {
    // Ask before replacing a bill that already has claims.
    if (Object.keys(bill.claims).length) setPending(payload);
    else dispatch(payload);
  };

  const runScan = async ({ rotation = 0, grayscale = false } = {}) => {
    const img = image.current;
    if (!img) return;
    scanMode.current = mode;
    setScan({ ...IDLE_SCAN, status: 'scanning', stage: 'Preparing image', fileName: img.name, hasImage: true });
    try {
      const { text, ms } = await scanImage(img.blob, {
        rotation, grayscale,
        onProgress: ({ status: stage, progress }) => setScan(s => s.status === 'scanning' ? { ...s, stage, progress } : s),
      });
      if (scanMode.current !== modeRef.current) return;
      const receipt = parseReceipt(text);
      setScan({ ...IDLE_SCAN, hasImage: true, fileName: img.name });
      if (!receipt.items.length && receipt.receiptTotalCents === null) {
        setScan({ ...IDLE_SCAN, status: 'error', error: READ_FAILED, canRetry: true, hasImage: true, fileName: img.name, lastText: text });
        announce(READ_FAILED);
        return;
      }
      announce(`Receipt read in ${(ms / 1000).toFixed(1)} seconds. Check the amounts.`);
      deliver({ type: 'LOAD_RECEIPT', receipt, kind: 'image', rawText: text, fileName: img.name });
    } catch (e) {
      if (e instanceof CancelledError) return;
      const msg = e instanceof OcrError ? e.message : READ_FAILED;
      setScan({ ...IDLE_SCAN, status: 'error', error: msg, canRetry: !(e instanceof OcrError && ['unsupported', 'too-large'].includes(e.code)), hasImage: !!image.current, fileName: img.name });
      announce(msg);
    }
  };
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const onFile = (file) => {
    try { checkFile(file); } catch (e) {
      setScan({ ...IDLE_SCAN, status: 'error', error: e.message, canRetry: false });
      announce(e.message);
      return;
    }
    setImage(file, file.name || 'photo');
    runScan();
  };
  const onRescan = ({ rotate, grayscale }) => {
    const img = image.current;
    if (!img) return;
    if (rotate) img.rotation = (img.rotation + 90) % 360;
    runScan({ rotation: img.rotation, grayscale: !!grayscale });
  };
  const onCancel = () => { cancelScan(); setScan(s => ({ ...IDLE_SCAN, hasImage: s.hasImage, fileName: s.fileName })); announce('Scan cancelled.'); };
  const onSampleImage = async (sample) => {
    try {
      const res = await fetch(sample.image);
      if (!res.ok) throw new Error('missing');
      const blob = await res.blob();
      setImage(blob, sample.image.split('/').pop());
      runScan();
    } catch {
      setScan({ ...IDLE_SCAN, status: 'error', error: 'The sample image could not be loaded. Use sample text instead.' });
    }
  };
  const onText = (text, sampleText = false) => {
    const receipt = parseReceipt(text);
    deliver({ type: 'LOAD_RECEIPT', receipt, kind: 'text', rawText: text, sampleText });
    announce(sampleText ? 'Sample text loaded. This skipped OCR.' : 'Text read. Check the amounts.');
  };
  const onManual = () => deliver({ type: 'LOAD_RECEIPT', receipt: emptyReceipt(), kind: 'manual' });

  const stopScan = () => { cancelScan(); setScan(IDLE_SCAN); if (image.current) { URL.revokeObjectURL(image.current.url); image.current = null; setImageUrl(''); } };
  const enterDemo = () => { stopScan(); dispatchApp({ type: 'ENTER_DEMO' }); announce('Demo mode. Sample receipts only; no real payments.'); };
  const exitDemo = () => { stopScan(); dispatchApp({ type: 'EXIT_DEMO' }); announce('Left demo mode. Your own bill is back.'); };
  const resetDemo = () => { stopScan(); dispatchApp({ type: 'RESET_DEMO' }); setPending(null); announce('Demo reset.'); };
  const newBill = () => { stopScan(); dispatchApp(demo ? { type: 'RESET_DEMO' } : { type: 'RESET_REAL' }); announce('Started a new bill.'); };

  // ---- Derived money: recomputed on every change, never stored ----
  const alloc = useMemo(() => allocateBill(bill), [bill]);
  const sample = demo || bill.receipt.sampleDisclaimer;
  const reward = useMemo(() => matchMerchant(bill.receipt.merchant), [bill.receipt.merchant]);
  const [dialog, setDialog] = useState(/** @type {null|'source'|'rewards'} */ (null));

  const step = bill.step;
  const go = s => { dispatch({ type: 'SET_STEP', step: s }); window.scrollTo({ top: 0 }); requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true })); };
  const hasBill = bill.source.kind !== 'none';

  return (
    <InvalidFields.Provider value={registry}>
      <a href="#main" className="skip">Skip to content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="wordmark"><BrandMark /><span>SplitCore</span>{demo && <span className="tag tag-demo">Demo</span>}</div>
          <nav aria-label="Steps" className="steps">
            <ol>
              {[['snap', 'Snap', true], ['claim', 'Claim', hasBill], ['settle', 'Settle', alloc.ready && invalid.size === 0]].map(([id, label, enabled], i) => (
                <li key={id}>
                  <button type="button" className={`step ${step === id ? 'step-on' : ''}`} aria-current={step === id ? 'step' : undefined}
                    disabled={!enabled || step === id} onClick={() => go(id)}>
                    <span className="step-num" aria-hidden="true">{i + 1}</span>{label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </header>
      {demo && (
        <div className="demo-bar" role="region" aria-label="Demo mode">
          <p><strong>Demo mode</strong> · fictional samples · no real payments or rewards claims</p>
          <div className="row-wrap">
            <button type="button" className="btn-text btn-small" onClick={resetDemo}>Reset demo</button>
            <button type="button" className="btn-text btn-small" onClick={exitDemo}>Exit demo</button>
          </div>
        </div>
      )}

      <main id="main" tabIndex={-1} className={`page page-${step}`}>
        {step === 'snap' && (
          <Snap scan={scan} demo={demo} hasBill={hasBill} draftAvailable={draftAvailable}
            onFile={onFile} onRescan={onRescan} onCancel={onCancel} onText={onText} onManual={onManual}
            onSampleImage={onSampleImage} onEnterDemo={enterDemo} onContinue={() => go('claim')}
            onRestoreDraft={() => {
              const d = storage.loadDraft();
              if (d) { stopScan(); dispatchApp({ type: 'RESTORE_DRAFT', bill: d }); announce('Local draft restored. Confirm the paid amount again.'); }
              else { setDraftAvailable(false); announce('The local draft could not be read.'); }
            }} />
        )}
        {step === 'claim' && (
          <Claim key={`${mode}-${bill.source.kind}-${bill.source.rawText.length}`} bill={bill} alloc={alloc} dispatch={dispatch} demo={demo} names={names} prefs={prefs}
            onPref={onPref} announce={announce} onSettle={() => go('settle')} invalidCount={invalid.size}
            onViewReceipt={() => setDialog('source')} onOpenRewards={() => setDialog('rewards')} sample={sample} />
        )}
        {step === 'settle' && (
          <Settle bill={bill} alloc={alloc} dispatch={dispatch} demo={demo} announce={announce} sample={sample}
            onBack={() => go('claim')} onNewBill={() => { newBill(); }} onOpenRewards={() => setDialog('rewards')} />
        )}
        {bill.restoredDraft && step !== 'snap' && <p className="draft-flag small muted">Local draft — restored from this device.</p>}
      </main>

      <footer className="footer">
        <p>SplitCore prepares requests; it doesn’t process payments or submit rewards claims.</p>
        {!demo && (prefs.rememberNames || prefs.rememberDraft) && (
          <button type="button" className="btn-text btn-small" onClick={() => {
            const ok = storage.clearAll();
            setPrefs({ rememberNames: false, rememberDraft: false, saveFailed: !ok }); setNames([]); setDraftAvailable(false);
            announce(ok ? 'SplitCore data cleared from this device.' : 'Local storage is unavailable.');
          }}>Clear SplitCore data on this device</button>
        )}
      </footer>

      <div className="sr-only" role="status" aria-live="polite">{status}</div>

      <Dialog open={dialog === 'source'} onClose={() => setDialog(null)} title="Receipt source" wide>
        {bill.source.kind === 'image' && imageUrl && <img className="source-img" src={imageUrl} alt="The receipt image you provided" />}
        {bill.source.sampleText && <p className="notice notice-plain small">Sample text — this path skipped OCR.</p>}
        {bill.source.rawText && (
          <>
            <h3>{bill.source.kind === 'image' ? 'Recognized text' : 'Text'}</h3>
            <SourceText bill={bill} />
          </>
        )}
      </Dialog>
      <Dialog open={dialog === 'rewards' && !!reward} onClose={() => setDialog(null)} title={`Points Rescue · ${reward?.name ?? ''}`}>
        {reward && <PointsRescuePanel entry={reward} receipt={bill.receipt} sample={sample} announce={announce} />}
      </Dialog>
      <Dialog open={!!pending} onClose={() => setPending(null)} title="Replace the current bill?">
        <p>This bill already has claims. Loading the new receipt clears them.</p>
        <div className="row-wrap">
          <button type="button" className="btn btn-primary" onClick={() => { dispatch(pending); setPending(null); }}>Replace bill</button>
          <button type="button" className="btn btn-secondary" onClick={() => setPending(null)}>Keep current bill</button>
        </div>
      </Dialog>
    </InvalidFields.Provider>
  );
}
