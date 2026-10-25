import React, { useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { SAMPLES } from '../demo/receipts.js';

/**
 * Snap: capture/upload, paste text, manual entry, and demo samples.
 * @param {{scan: any, demo: boolean, hasBill: boolean, draftAvailable: boolean,
 *   onFile: (f: File) => void, onRescan: (opts: {rotate?: boolean, grayscale?: boolean}) => void, onCancel: () => void,
 *   onText: (t: string, sample?: boolean) => void, onManual: () => void, onSampleImage: (s: any) => void,
 *   onEnterDemo: () => void, onContinue: () => void, onRestoreDraft: () => void}} props
 */
export default function Snap(p) {
  const photo = useRef(/** @type {HTMLInputElement|null} */ (null));
  const upload = useRef(/** @type {HTMLInputElement|null} */ (null));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const busy = p.scan.status === 'scanning';

  const pick = e => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) p.onFile(f);
  };

  return (
    <section className="snap" aria-labelledby="snap-title">
      <div className="hero">
        <h1 id="snap-title">One bill. Everyone’s share.</h1>
        <p className="lede">You cover the bill. We handle the split.</p>
      </div>

      {p.hasBill && !busy && (
        <div className="notice notice-plain">
          <p>You have a bill in progress.</p>
          <button type="button" className="btn btn-secondary" onClick={p.onContinue}>Continue current bill <Icon name="arrow" /></button>
        </div>
      )}
      {p.draftAvailable && !p.demo && !busy && (
        <div className="notice notice-plain">
          <p>A local draft from this device is available.</p>
          <button type="button" className="btn btn-secondary" onClick={p.onRestoreDraft}>Restore local draft</button>
        </div>
      )}

      <div className="capture card">
        <div className="capture-head">
          <span className="capture-icon"><Icon name="receipt" size={28} /></span>
          <div>
            <h2>CoreScan · Scan receipt</h2>
            <p className="muted">Photograph or upload a printed receipt.</p>
          </div>
        </div>

        {busy ? (
          <div className="scan-progress" role="status" aria-live="polite">
            <p className="scan-stage">{p.scan.stage || 'Working'}…</p>
            {p.scan.progress === null
              ? <div className="bar bar-indeterminate" aria-hidden="true"><span /></div>
              : <div className="bar" role="progressbar" aria-label="Reading text" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.scan.progress * 100)}>
                  <span style={{ width: `${Math.round(p.scan.progress * 100)}%` }} />
                </div>}
            <p className="muted small">{p.scan.fileName ? `Image: ${p.scan.fileName}` : ''}</p>
            <button type="button" className="btn btn-secondary" onClick={p.onCancel}>Cancel scan</button>
          </div>
        ) : (
          <>
            <div className="capture-actions">
              <button type="button" className="btn btn-primary" onClick={() => photo.current?.click()}>
                <Icon name="camera" /> Take photo
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => upload.current?.click()}>
                <Icon name="image" /> Choose image
              </button>
              <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
              <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
            </div>
            <ul className="advice">
              <li>Lay the receipt flat in even light.</li>
              <li>Keep it upright with every edge and price in view.</li>
              <li>PNG, JPEG or WebP, up to 15 MB.</li>
            </ul>
          </>
        )}

        {p.scan.status === 'error' && (
          <div className="notice notice-warning" role="alert">
            <Icon name="alert" />
            <div>
              <p>{p.scan.error}</p>
              <div className="row-wrap">
                {p.scan.canRetry && <button type="button" className="btn btn-secondary btn-small" onClick={() => p.onRescan({})}>Try again</button>}
                {p.scan.canRetry && <button type="button" className="btn btn-secondary btn-small" onClick={() => p.onRescan({ rotate: true })}><Icon name="rotate" /> Rotate 90° and scan</button>}
                {p.scan.canRetry && <button type="button" className="btn btn-secondary btn-small" onClick={() => p.onRescan({ grayscale: true })}>Try grayscale</button>}
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setPasteOpen(true)}>Paste receipt text</button>
                <button type="button" className="btn btn-secondary btn-small" onClick={p.onManual}>Edit the bill</button>
              </div>
            </div>
          </div>
        )}
        {p.scan.status === 'idle' && p.scan.hasImage && !busy && (
          <div className="row-wrap rescan">
            <span className="muted small">Last image: {p.scan.fileName || 'photo'}</span>
            <button type="button" className="btn-text" onClick={() => p.onRescan({ rotate: true })}><Icon name="rotate" /> Rotate 90° and scan again</button>
            <button type="button" className="btn-text" onClick={() => p.onRescan({ grayscale: true })}>Scan again in grayscale</button>
          </div>
        )}

        <p className="fineprint">Receipt processing happens in your browser. First scan downloads the OCR model.</p>
      </div>

      <div className="alt-actions">
        <button type="button" className="btn-text" aria-expanded={pasteOpen} aria-controls="paste-panel" onClick={() => setPasteOpen(o => !o)} disabled={busy}>
          <Icon name="text" /> Paste receipt text
        </button>
        <button type="button" className="btn-text" onClick={p.onManual} disabled={busy}><Icon name="plus" /> Enter manually</button>
        {!p.demo && <button type="button" className="btn-text" onClick={p.onEnterDemo} disabled={busy}><Icon name="star" /> Try a sample</button>}
      </div>

      {pasteOpen && (
        <div id="paste-panel" className="card paste">
          <label htmlFor="paste-text">Receipt text</label>
          <p className="field-hint" id="paste-hint">One item per line with its price on the right, e.g. “2 SANDWICH 12.00”. Include TAX and TOTAL lines.</p>
          <textarea id="paste-text" rows={8} value={pasted} aria-describedby="paste-hint" onChange={e => setPasted(e.target.value)} />
          <button type="button" className="btn btn-primary" disabled={!pasted.trim()} onClick={() => p.onText(pasted)}>Read text</button>
        </div>
      )}

      {p.demo && (
        <section className="card samples" aria-labelledby="samples-title">
          <h2 id="samples-title">Sample receipts</h2>
          <p className="muted">Fictional receipts for trying SplitCore. “Scan sample image” runs the real OCR engine on the picture; “Use sample text” skips OCR and sends the printed text to the same parser.</p>
          <ul className="sample-list">
            {SAMPLES.map(s => (
              <li key={s.id} className="sample">
                <img src={s.image} alt={`Sample receipt: ${s.title}`} loading="lazy" width="72" height="96" />
                <div className="sample-text">
                  <strong>{s.title}</strong>
                  <span className="muted small">{s.detail}</span>
                  <div className="row-wrap">
                    <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => p.onSampleImage(s)}>Scan sample image</button>
                    <button type="button" className="btn-text" disabled={busy} onClick={() => p.onText(s.text, true)}>Use sample text</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
