import React, { useRef, useState } from 'react';
import { Icon, ProgressRing } from './ui.jsx';
import { SAMPLES } from '../demo/receipts.js';

/**
 * Snap: capture/upload (with drag-and-drop and paste), paste text, manual entry, and demo samples.
 */
export default function Snap(p) {
  const photo = useRef(/** @type {HTMLInputElement|null} */ (null));
  const upload = useRef(/** @type {HTMLInputElement|null} */ (null));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [drag, setDrag] = useState(false);
  const busy = p.scan.status === 'scanning';

  const pick = e => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) p.onFile(f);
  };
  const drop = e => {
    e.preventDefault();
    setDrag(false);
    if (busy) return;
    const f = e.dataTransfer?.files?.[0];
    if (f) p.onFile(f);
  };

  return (
    <section className="snap" aria-labelledby="snap-title">
      <div className="snap-hero">
        <div className="hero-copy reveal">
          <p className="eyebrow"><Icon name="sparkle" size={14} /> Snap · Claim · Settle</p>
          <h1 id="snap-title">One bill.<br /><span className="grad-text">Everyone’s share.</span></h1>
          <p className="lede">You cover the bill. We handle the split. Scan the receipt, tap who had what, and send everyone their exact share — down to the cent.</p>
          <ul className="trust" aria-label="Highlights">
            <li><Icon name="shield" size={16} /> Reads receipts on your device</li>
            <li><Icon name="target" size={16} /> Exact to the cent</li>
            <li><Icon name="gift" size={16} /> Spots restaurant rewards</li>
          </ul>
        </div>

        <div className="capture-wrap reveal" style={{ '--i': 1 }}>
          {p.current && !busy && (
            <div className="continue-bar">
              <span><Icon name="receipt" size={16} /> {p.current.merchant ? <><strong>{p.current.merchant}</strong> bill in progress</> : 'Bill in progress'}</span>
              <button type="button" className="btn btn-secondary btn-small" onClick={p.onContinue}>Continue <Icon name="arrow" size={16} /></button>
            </div>
          )}
          {p.draftAvailable && !p.demo && !busy && (
            <div className="continue-bar">
              <span><Icon name="receipt" size={16} /> A local draft is saved on this device.</span>
              <button type="button" className="btn btn-secondary btn-small" onClick={p.onRestoreDraft}>Restore local draft</button>
            </div>
          )}

          {busy ? (
            <ScanView scan={p.scan} imageUrl={p.imageUrl} onCancel={p.onCancel} />
          ) : (
            <div className={`dropzone ${drag ? 'is-drag' : ''}`}
              onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={drop}>
              <div className="dropzone-art" aria-hidden="true">
                <span className="dz-receipt"><i /><i /><i /><i /></span>
                <span className="dz-beam" />
              </div>
              <h2>Scan a receipt</h2>
              <p className="muted">Drop a photo here, take one, or paste an image.</p>
              <div className="capture-actions">
                <button type="button" className="btn btn-primary btn-lg" onClick={() => photo.current?.click()}>
                  <Icon name="camera" /> Take photo
                </button>
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => upload.current?.click()}>
                  <Icon name="upload" /> Choose image
                </button>
                <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
                <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
              </div>
              <p className="fineprint">PNG, JPEG or WebP up to 15 MB. Flat, well lit, every price in view. Recognition runs in your browser; the first scan downloads the OCR model.</p>

              {p.scan.status === 'error' && (
                <div className="notice notice-warning scan-error" role="alert">
                  <Icon name="alert" />
                  <div>
                    <p>{p.scan.error}</p>
                    <div className="row-wrap">
                      {p.scan.canRetry && <button type="button" className="btn btn-secondary btn-small" onClick={() => p.onRescan({})}>Try again</button>}
                      {p.scan.canRetry && <button type="button" className="btn btn-secondary btn-small" onClick={() => p.onRescan({ rotate: true })}><Icon name="rotate" size={16} /> Rotate 90° and scan</button>}
                      {p.scan.canRetry && <button type="button" className="btn btn-secondary btn-small" onClick={() => p.onRescan({ grayscale: true })}>Try grayscale</button>}
                      {p.scan.lastText && <button type="button" className="btn btn-secondary btn-small" onClick={() => p.onText(p.scan.lastText, false, 'image')}>Edit what we read</button>}
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => setPasteOpen(true)}>Paste receipt text</button>
                      <button type="button" className="btn btn-secondary btn-small" onClick={p.onManual}>Edit the bill</button>
                    </div>
                  </div>
                </div>
              )}
              {p.scan.status === 'idle' && p.scan.hasImage && (
                <div className="row-wrap rescan">
                  <span className="muted small">Last image: {p.scan.fileName || 'photo'}</span>
                  <button type="button" className="btn-text btn-small" onClick={() => p.onRescan({ rotate: true })}><Icon name="rotate" size={16} /> Rotate and rescan</button>
                  <button type="button" className="btn-text btn-small" onClick={() => p.onRescan({ grayscale: true })}>Rescan in grayscale</button>
                </div>
              )}
            </div>
          )}

          <div className="alt-actions">
            <button type="button" className="chip-btn" aria-expanded={pasteOpen} aria-controls="paste-panel" onClick={() => setPasteOpen(o => !o)} disabled={busy}>
              <Icon name="text" size={18} /> Paste receipt text
            </button>
            <button type="button" className="chip-btn" onClick={p.onManual} disabled={busy}><Icon name="edit" size={18} /> Enter manually</button>
            {!p.demo && <button type="button" className="chip-btn chip-btn-accent" onClick={p.onEnterDemo} disabled={busy}><Icon name="sparkle" size={18} /> Try a sample</button>}
          </div>

          {pasteOpen && (
            <div id="paste-panel" className="card paste">
              <label htmlFor="paste-text">Receipt text</label>
              <p className="field-hint" id="paste-hint">One item per line with its price on the right, e.g. “2 SANDWICH 12.00”. Include the TAX and TOTAL lines.</p>
              <textarea id="paste-text" rows={8} value={pasted} aria-describedby="paste-hint" onChange={e => setPasted(e.target.value)} />
              <button type="button" className="btn btn-primary" disabled={!pasted.trim()} onClick={() => p.onText(pasted)}>Read text <Icon name="arrow" size={18} /></button>
            </div>
          )}
        </div>
      </div>

      {p.demo && (
        <section className="samples reveal" style={{ '--i': 2 }} aria-labelledby="samples-title">
          <div className="section-head">
            <h2 id="samples-title" tabIndex={-1}>Sample receipts</h2>
            <p className="muted small">Fictional receipts. “Scan” runs real OCR on the picture; “Use text” skips OCR.</p>
          </div>
          <ul className="sample-grid">
            {SAMPLES.map((s, i) => (
              <li key={s.id} className="sample-card" style={{ '--i': i }}>
                <div className="sample-thumb"><img src={s.image} alt={`Sample receipt: ${s.title}`} loading="lazy" /></div>
                <div className="sample-body">
                  <strong>{s.title}</strong>
                  <span className="muted small">{s.detail}</span>
                  <div className="row-wrap">
                    <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => p.onSampleImage(s)}><Icon name="camera" size={16} /> Scan sample image</button>
                    <button type="button" className="btn-text btn-small" disabled={busy} onClick={() => p.onText(s.text, true)}>Use sample text</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="how reveal" style={{ '--i': 3 }} aria-labelledby="how-title">
        <h2 id="how-title" className="sr-only">How it works</h2>
        {[
          ['camera', 'Snap', 'Photo or upload. SplitCore reads every line and checks that it adds up to the total.'],
          ['users', 'Claim', 'Tap people onto each item. Share a plate with one tap per person.'],
          ['wallet', 'Settle', 'Exact shares with tax, tip and discounts split fairly. Copy, share or QR.'],
        ].map(([icon, title, text], i) => (
          <article key={title} className="how-card" style={{ '--i': i }}>
            <span className="how-icon"><Icon name={icon} size={22} /></span>
            <span className="how-num">0{i + 1}</span>
            <h3>{title}</h3>
            <p className="muted small">{text}</p>
          </article>
        ))}
      </section>
    </section>
  );
}

/** Live view of the actual image being read, with the engine's real stage and progress. */
function ScanView({ scan, imageUrl, onCancel }) {
  const pct = scan.progress === null ? null : Math.round(scan.progress * 100);
  return (
    <div className="scanview" role="status" aria-live="polite">
      <div className="scan-frame">
        {imageUrl ? <img src={imageUrl} alt="" /> : <div className="scan-placeholder" />}
        <span className="scan-corners" aria-hidden="true"><i /><i /><i /><i /></span>
        <span className="scan-beam" aria-hidden="true" />
      </div>
      <div className="scan-status">
        <ProgressRing value={pct ?? 0} max={100} size={56} stroke={6}>{pct === null ? <span className="spinner" aria-hidden="true" /> : `${pct}%`}</ProgressRing>
        <div>
          <p className="scan-stage">{scan.stage || 'Working'}…</p>
          <p className="muted small">{scan.fileName ? `Reading ${scan.fileName}` : 'Reading your receipt'}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>Cancel scan</button>
      </div>
    </div>
  );
}
