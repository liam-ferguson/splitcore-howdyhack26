import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { appReducer, initialState } from './state.js';
import { parseReceipt, emptyReceipt, validateReceipt } from './domain/receipt.js';
import { allocateBill } from './domain/split.js';
import { findRewards, getEntry } from './domain/rewards.js';
import { scanImage, cancelScan, checkFile, OcrError, CancelledError, READ_FAILED } from './services/ocr.js';
import * as storage from './services/storage.js';
import { Dialog, ErrorBoundary, Icon, InvalidFields, Logo, Toasts } from './components/ui.jsx';
import Snap from './components/Snap.jsx';
import Claim from './components/Claim.jsx';
import Settle from './components/Settle.jsx';
import { RestaurantPicker, RewardsPanel } from './components/Rewards.jsx';

const IDLE_SCAN = { status: 'idle', stage: '', progress: null, error: '', fileName: '', canRetry: false, hasImage: false, lastText: '' };
const STEPS = [['snap', 'Snap'], ['claim', 'Claim'], ['settle', 'Settle']];

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

export default function App() {
  const [state, dispatchApp] = useReducer(appReducer, undefined, () => initialState());
  const stateRef = useRef(state);
  stateRef.current = state;
  const mode = state.mode;
  const demo = mode === 'demo';
  const bill = /** @type {import('./state.js').Bill} */ (state[mode]);
  const dispatch = useCallback(a => dispatchApp(a), []);

  // ---- Toasts and polite announcements ----
  const [toasts, setToasts] = useState(/** @type {any[]} */ ([]));
  const toastSeq = useRef(0);
  const dismissToast = useCallback(id => setToasts(t => t.filter(x => x.id !== id)), []);
  const toast = useCallback((text, opts = {}) => {
    const id = ++toastSeq.current;
    setToasts(t => [...t.slice(-2), { id, text, ...opts }]);
    setTimeout(() => dismissToast(id), opts.action ? 8000 : 4500);
  }, [dismissToast]);
  const [status, setStatus] = useState('');
  const announce = useCallback(m => { setStatus(''); requestAnimationFrame(() => setStatus(m)); }, []);

  // ---- Preferences, reusable names, optional draft (all failure tolerant) ----
  const [prefs, setPrefs] = useState(() => ({ ...storage.loadPrefs(), saveFailed: false }));
  const [names, setNames] = useState(() => (storage.loadPrefs().rememberNames ? storage.loadNames() : []));
  const [draftAvailable, setDraftAvailable] = useState(() => storage.loadPrefs().rememberDraft && !!storage.loadDraft());
  const onPref = patch => {
    const next = { ...prefs, ...patch };
    const ok = storage.savePrefs(next);
    if (patch.rememberNames === false) storage.clearNames();
    if (patch.rememberDraft === false) { storage.clearDraft(); setDraftAvailable(false); }
    if (patch.rememberPayment === false) storage.clearPayment();
    if (patch.rememberPayment === true && bill.payment.method !== 'none') storage.savePayment(bill.payment);
    setPrefs({ ...next, saveFailed: !ok });
    if (ok) toast(patch.rememberNames === true ? 'Names will be remembered on this device.' : patch.rememberDraft === true ? 'This bill will be kept as a local draft.' : patch.rememberPayment === true ? 'Your payment handle will be remembered on this device.' : 'Preference saved.', { tone: 'success' });
    else toast('This browser blocked local storage; SplitCore keeps working in memory.', { tone: 'warn' });
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

  // Remembered payment handle (opt-in): fill it into any bill that has none, and keep it updated.
  useEffect(() => {
    if (!prefs.rememberPayment || bill.payment.method !== 'none') return;
    const saved = storage.loadPayment();
    if (saved) dispatch({ type: 'SET_PAYMENT', payment: saved });
  }, [prefs.rememberPayment, mode, bill.source.loadId]);
  useEffect(() => {
    if (prefs.rememberPayment && bill.payment.method !== 'none') storage.savePayment(bill.payment);
  }, [prefs.rememberPayment, bill.payment]);

  // ---- Invalid-field registry blocks settlement while text is unparseable ----
  const [invalid, setInvalid] = useState(/** @type {Set<string>} */ (new Set()));
  const registry = useMemo(() => ({
    set: (id, bad) => setInvalid(prev => {
      if (prev.has(id) === bad) return prev;
      const n = new Set(prev); bad ? n.add(id) : n.delete(id); return n;
    }),
  }), []);

  // ---- Loading a new receipt: replace immediately, offer Undo (reads the LATEST state) ----
  const loadReceipt = useCallback((payload, label) => {
    const cur = stateRef.current;
    const prev = cur[cur.mode];
    const hadWork = prev && prev.source.kind !== 'none' && (prev.receipt.items.length > 0 || Object.keys(prev.claims).length > 0);
    dispatchApp(payload);
    window.scrollTo({ top: 0 });
    if (hadWork) {
      const snapshotMode = cur.mode;
      // Undo returns to the previous bill's workspace, not the Snap screen it was replaced from.
      const restored = { ...prev, step: 'claim' };
      toast(label ?? 'Started a new bill.', { action: { label: 'Undo', run: () => { dispatchApp({ type: 'SET_BILL', mode: snapshotMode, bill: restored }); window.scrollTo({ top: 0 }); announce('Previous bill restored.'); } } });
    } else if (label) {
      toast(label, { tone: 'success' });
    }
  }, [toast, announce]);

  // ---- Scanning. Image stays in memory only. ----
  const [scan, setScan] = useState(IDLE_SCAN);
  const image = useRef(/** @type {{blob: Blob, url: string, name: string, rotation: number}|null} */ (null));
  const [imageUrl, setImageUrl] = useState('');
  // Each bill keeps its own image URL (source.imageUrl) so "View source" and Undo always show the
  // right picture. Old URLs are revoked once no bill and no scan references them (bounded list).
  const urls = useRef(/** @type {string[]} */ ([]));
  const setImage = (blob, name) => {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    image.current = { blob, url, name, rotation: 0 };
    setImageUrl(url);
    while (urls.current.length > 6) {
      const s = stateRef.current;
      const live = new Set([s.real.source.imageUrl, s.demo?.source.imageUrl, image.current.url]);
      const idx = urls.current.findIndex(u => !live.has(u));
      if (idx < 0) break;
      URL.revokeObjectURL(urls.current[idx]);
      urls.current.splice(idx, 1);
    }
  };
  useEffect(() => () => { cancelScan(); urls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const runScan = async ({ rotation = 0, grayscale = false } = {}) => {
    const img = image.current;
    if (!img) return;
    const startedIn = stateRef.current.mode;
    setScan({ ...IDLE_SCAN, status: 'scanning', stage: 'Preparing image', fileName: img.name, hasImage: true });
    requestAnimationFrame(() => document.querySelector('.capture-wrap')?.scrollIntoView({
      block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
    try {
      const { text, ms } = await scanImage(img.blob, {
        rotation, grayscale,
        onProgress: ({ status: stage, progress }) => setScan(s => s.status === 'scanning' ? { ...s, stage, progress } : s),
        // Score each OCR pass by the parsed result: a receipt that adds up wins immediately.
        evaluate: t => {
          const r = parseReceipt(t);
          const v = validateReceipt(r);
          const good = r.items.length > 0 && r.receiptTotalCents !== null && v.arithmeticMatches;
          const unread = r.issues.filter(i => i.code === 'unknown-line').length;
          const closeness = r.receiptTotalCents !== null ? Math.max(0, 500 - Math.min(500, Math.abs(v.adjustmentCents) / 10)) : 0;
          return { good, score: (good ? 10000 : 0) + (r.receiptTotalCents !== null ? 1000 : 0) + closeness + r.items.length * 20 - unread * 10 };
        },
      });
      if (stateRef.current.mode !== startedIn) return;
      const receipt = parseReceipt(text);
      if (!receipt.items.length && receipt.receiptTotalCents === null) {
        setScan({ ...IDLE_SCAN, status: 'error', error: READ_FAILED, canRetry: true, hasImage: true, fileName: img.name, lastText: text.trim() ? text : '' });
        announce(READ_FAILED);
        return;
      }
      setScan({ ...IDLE_SCAN, hasImage: true, fileName: img.name });
      announce(`Receipt read in ${(ms / 1000).toFixed(1)} seconds. Check the amounts.`);
      loadReceipt({ type: 'LOAD_RECEIPT', receipt, kind: 'image', rawText: text, fileName: img.name, imageUrl: img.url },
        `Read ${receipt.merchant || 'your receipt'} in ${(ms / 1000).toFixed(1)}s`);
    } catch (e) {
      if (e instanceof CancelledError) return;
      const msg = e instanceof OcrError ? e.message : READ_FAILED;
      setScan({ ...IDLE_SCAN, status: 'error', error: msg, canRetry: !(e instanceof OcrError && ['unsupported', 'too-large'].includes(e.code)), hasImage: !!image.current, fileName: img.name });
      announce(msg);
    }
  };

  const onFile = (file) => {
    if (scan.status === 'scanning') return;
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
  const onText = (text, sampleText = false, kind = 'text') => {
    const receipt = parseReceipt(text);
    setScan(s => ({ ...s, status: 'idle', error: '', lastText: '' }));
    loadReceipt({ type: 'LOAD_RECEIPT', receipt, kind, rawText: text, sampleText,
      fileName: kind === 'image' ? image.current?.name : '', imageUrl: kind === 'image' ? image.current?.url : '' },
      sampleText ? 'Sample text loaded — this skipped OCR.' : 'Text read. Check the amounts.');
  };
  const onManual = () => loadReceipt({ type: 'LOAD_RECEIPT', receipt: emptyReceipt(), kind: 'manual' }, 'Blank bill ready. Add the items.');

  // Paste an image straight onto the Snap screen.
  useEffect(() => {
    if (bill.step !== 'snap') return;
    const onPaste = e => {
      const tag = /** @type {HTMLElement} */ (e.target)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      const file = [...(e.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/'));
      if (file) { e.preventDefault(); onFile(file); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const stopScan = () => { cancelScan(); setScan(IDLE_SCAN); };
  const enterDemo = () => {
    stopScan();
    dispatchApp({ type: 'ENTER_DEMO' });
    toast('Demo mode — sample receipts only, no real payments.');
    // The "Try a sample" button disappears in demo mode; move focus to the samples instead of <body>.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const h = document.getElementById('samples-title');
      if (!h) return;
      h.focus({ preventScroll: true });
      h.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }));
  };
  const exitDemo = () => { stopScan(); dispatchApp({ type: 'EXIT_DEMO' }); toast('Left demo mode. Your own bill is back.'); };
  const resetDemo = () => { stopScan(); dispatchApp({ type: 'RESET_DEMO' }); toast('Demo reset.'); };
  const newBill = () => {
    stopScan();
    const cur = stateRef.current;
    const prev = cur[cur.mode];
    dispatchApp(cur.mode === 'demo' ? { type: 'RESET_DEMO' } : { type: 'RESET_REAL' });
    window.scrollTo({ top: 0 });
    toast('Started a new bill.', { action: { label: 'Undo', run: () => dispatchApp({ type: 'SET_BILL', mode: cur.mode, bill: prev }) } });
  };
  const restoreDraft = () => {
    const d = storage.loadDraft();
    if (!d) { setDraftAvailable(false); toast('The local draft could not be read.', { tone: 'warn' }); return; }
    stopScan();
    const cur = stateRef.current;
    const prev = cur.real;
    dispatchApp({ type: 'RESTORE_DRAFT', bill: d });
    toast('Local draft restored. Confirm the paid amount again.', prev.receipt.items.length ? { action: { label: 'Undo', run: () => dispatchApp({ type: 'SET_BILL', mode: 'real', bill: prev }) } } : { tone: 'success' });
  };

  // ---- Derived money and rewards: recomputed on every change, never stored ----
  const alloc = useMemo(() => allocateBill(bill), [bill]);
  const rewards = useMemo(() => findRewards(bill.receipt), [bill.receipt]);
  const sample = demo || bill.receipt.sampleDisclaimer;
  const [dialog, setDialog] = useState(/** @type {null|'source'|'rewards'|'picker'} */ (null));
  const pickRestaurant = id => {
    dispatch({ type: 'SET_REWARDS_CHOICE', choice: id });
    setDialog(null);
    const e = id === 'none' ? null : getEntry(id);
    toast(e ? `Showing ${e.program}.` : 'Rewards lookup off for this bill.', { tone: 'success' });
  };

  const step = bill.step;
  const go = s => { dispatch({ type: 'SET_STEP', step: s }); window.scrollTo({ top: 0 }); requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true })); };
  const hasBill = bill.source.kind !== 'none';
  const canSettle = alloc.ready && invalid.size === 0;
  const stepIndex = STEPS.findIndex(([id]) => id === step);

  return (
    <InvalidFields.Provider value={registry}>
      <div className="bg" aria-hidden="true"><span className="orb orb-a" /><span className="orb orb-b" /><span className="orb orb-c" /><span className="grid-sheen" /></div>
      <a href="#main" className="skip">Skip to content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="wordmark" onClick={() => go('snap')} aria-label="SplitCore home">
            <Logo /><span>SplitCore</span>{demo && <span className="tag tag-demo">Demo</span>}
          </button>
          <nav aria-label="Steps" className="steps" style={{ '--step': stepIndex }}>
            <span className="steps-indicator" aria-hidden="true" />
            <ol>
              {STEPS.map(([id, label], i) => {
                const enabled = id === 'snap' || (id === 'claim' && hasBill) || (id === 'settle' && canSettle);
                return (
                  <li key={id}>
                    <button type="button" className={`step ${step === id ? 'step-on' : ''} ${i < stepIndex ? 'step-past' : ''}`} aria-current={step === id ? 'step' : undefined}
                      disabled={!enabled || step === id} onClick={() => go(id)}>
                      <span className="step-num" aria-hidden="true">{i < stepIndex ? <Icon name="check" size={12} /> : i + 1}</span>{label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </header>
      {demo && (
        <div className="demo-bar" role="region" aria-label="Demo mode">
          <p><Icon name="sparkle" size={16} /> <strong>Demo mode</strong> · fictional samples · no real payments or rewards claims</p>
          <div className="row-wrap">
            <button type="button" className="btn-text btn-small" onClick={resetDemo}>Reset demo</button>
            <button type="button" className="btn-text btn-small" onClick={exitDemo}>Exit demo</button>
          </div>
        </div>
      )}

      <main id="main" tabIndex={-1} className={`page page-${step}`}>
        <ErrorBoundary key={`${mode}-${step}`}>
          <div className="page-anim" key={`${mode}-${step}-${bill.source.loadId}`}>
            {step === 'snap' && (
              <Snap scan={scan} imageUrl={imageUrl} demo={demo} current={hasBill ? { merchant: bill.receipt.merchant } : null} draftAvailable={draftAvailable}
                onFile={onFile} onRescan={onRescan} onCancel={onCancel} onText={onText} onManual={onManual}
                onSampleImage={onSampleImage} onEnterDemo={enterDemo} onContinue={() => go('claim')} onRestoreDraft={restoreDraft} />
            )}
            {step === 'claim' && (
              <Claim bill={bill} alloc={alloc} dispatch={dispatch} demo={demo} names={names} prefs={prefs}
                onPref={onPref} announce={announce} onSettle={() => go('settle')} invalidCount={invalid.size}
                onViewReceipt={() => setDialog('source')} rewards={rewards} sample={sample}
                onRewardsDetails={() => setDialog('rewards')} onRewardsPick={() => setDialog('picker')} />
            )}
            {step === 'settle' && (
              <Settle bill={bill} alloc={alloc} dispatch={dispatch} demo={demo} announce={announce} sample={sample} rewards={rewards} prefs={prefs} onPref={onPref}
                onBack={() => go('claim')} onNewBill={newBill}
                onRewardsDetails={() => setDialog('rewards')} onRewardsPick={() => setDialog('picker')} />
            )}
            {bill.restoredDraft && step !== 'snap' && <p className="draft-flag small muted">Local draft — restored from this device.</p>}
          </div>
        </ErrorBoundary>
      </main>

      <footer className="footer">
        <p><Logo size={18} /> SplitCore prepares requests; it doesn’t process payments or submit rewards claims.</p>
        {!demo && (prefs.rememberNames || prefs.rememberDraft || prefs.rememberPayment) && (
          <button type="button" className="btn-text btn-small" onClick={() => {
            const ok = storage.clearAll();
            setPrefs({ rememberNames: false, rememberDraft: false, rememberPayment: false, saveFailed: !ok }); setNames([]); setDraftAvailable(false);
            toast(ok ? 'SplitCore data cleared from this device.' : 'Local storage is unavailable.', { tone: ok ? 'success' : 'warn' });
          }}>Clear SplitCore data on this device</button>
        )}
      </footer>

      <Toasts toasts={toasts} onDismiss={dismissToast} />
      <div className="sr-only" role="status" aria-live="polite">{status}</div>

      <Dialog open={dialog === 'source'} onClose={() => setDialog(null)} title="Receipt source" wide icon="receipt">
        {bill.source.kind === 'image' && bill.source.imageUrl && <img className="source-img" src={bill.source.imageUrl} alt="The receipt image you provided" />}
        {bill.source.sampleText && <p className="notice notice-plain small">Sample text — this path skipped OCR.</p>}
        {bill.source.rawText && (
          <>
            <h3>{bill.source.kind === 'image' ? 'Recognized text' : 'Text'}</h3>
            <SourceText bill={bill} />
          </>
        )}
      </Dialog>
      <Dialog open={dialog === 'rewards' && !!rewards.entry} onClose={() => setDialog(null)} title={rewards.entry ? `${rewards.entry.name} rewards` : 'Rewards'} icon="gift">
        {rewards.entry && <RewardsPanel entry={rewards.entry} receipt={bill.receipt} sample={sample} announce={announce} />}
      </Dialog>
      <RestaurantPicker open={dialog === 'picker'} onClose={() => setDialog(null)} onPick={pickRestaurant} currentId={rewards.entry?.id} />
    </InvalidFields.Provider>
  );
}
