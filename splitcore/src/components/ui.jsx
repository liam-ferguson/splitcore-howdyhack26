import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { centsToPlain, parseCents } from '../domain/money.js';

/** Original minimal icons. Decorative unless a label is given. */
export function Icon({ name, size = 20, label }) {
  const paths = {
    camera: <><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
    image: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 16l5-5 4 4 2-2 5 5" /><circle cx="15.5" cy="9.5" r="1.5" /></>,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    share: <><path d="M12 15V4" /><path d="M8 8l4-4 4 4" /><path d="M5 12v7h14v-7" /></>,
    arrow: <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
    back: <><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V5h10" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    close: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
    alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>,
    text: <><path d="M5 6h14" /><path d="M5 11h14" /><path d="M5 16h9" /></>,
    rotate: <><path d="M5 12a7 7 0 1 0 2-5" /><path d="M5 4v4h4" /></>,
    star: <path d="M12 4l2.4 5 5.6.7-4.1 3.8 1 5.5-4.9-2.7-4.9 2.7 1-5.5L4 9.7 9.6 9z" />,
    receipt: <><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" /><path d="M9 8h6" /><path d="M9 12h6" /></>,
  };
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label} focusable="false">
      {paths[name]}
    </svg>
  );
}

/** Split-circle brand mark: two original semicircles. */
export function BrandMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="brandmark">
      <path d="M15 2a14 14 0 0 0 0 28z" fill="var(--primary)" />
      <path d="M17 2a14 14 0 0 1 0 28z" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1" />
    </svg>
  );
}

/** Registry of fields currently holding invalid text, so settlement can be blocked. */
export const InvalidFields = createContext(/** @type {{set: (id: string, bad: boolean) => void}} */ ({ set: () => {} }));

/**
 * Money input that keeps a string draft and commits integer cents only when valid.
 * @param {{id: string, label: string, cents: number|null, onCommit: (c: number|null) => void,
 *   allowEmpty?: boolean, hint?: string, error?: string, highlight?: boolean, className?: string}} props
 */
export function MoneyField({ id, label, cents, onCommit, allowEmpty = false, hint, error, highlight, className = '' }) {
  const toText = c => (c === null || c === undefined ? '' : centsToPlain(c));
  const [text, setText] = useState(toText(cents));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  const registry = useContext(InvalidFields);

  useEffect(() => {
    if (!focused.current) { setText(toText(cents)); setBad(false); }
  }, [cents]);
  useEffect(() => { registry.set(id, bad); }, [id, bad]);
  useEffect(() => () => registry.set(id, false), [id]);

  const change = v => {
    setText(v);
    if (!v.trim() && allowEmpty) { setBad(false); if (cents !== null) onCommit(null); return; }
    const c = parseCents(v);
    if (c === null) { setBad(true); return; }
    setBad(false);
    if (c !== cents) onCommit(c);
  };
  const msgId = `${id}-msg`;
  const message = bad ? 'Enter an amount like 12.50 (no minus sign, up to two decimals).' : error;
  return (
    <div className={`field ${highlight ? 'field-highlight' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      <div className="money-input">
        <span aria-hidden="true">$</span>
        <input id={id} inputMode="decimal" autoComplete="off" value={text}
          aria-invalid={bad || !!error || undefined} aria-describedby={message || hint ? msgId : undefined}
          onFocus={() => { focused.current = true; }}
          onBlur={() => { focused.current = false; if (!bad) setText(toText(cents)); }}
          onChange={e => change(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      </div>
      {(message || hint) && <p id={msgId} className={message ? 'field-error' : 'field-hint'}>{message || hint}</p>}
    </div>
  );
}

/**
 * Native dialog with labelled close, Escape dismissal and focus return.
 * @param {{open: boolean, onClose: () => void, title: string, children: any, wide?: boolean}} props
 */
export function Dialog({ open, onClose, title, children, wide }) {
  const ref = useRef(/** @type {HTMLDialogElement|null} */ (null));
  const returnTo = useRef(/** @type {HTMLElement|null} */ (null));
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnTo.current = /** @type {HTMLElement|null} */ (document.activeElement);
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);
  useEffect(() => () => { if (ref.current?.open) ref.current.close(); }, []);
  return (
    <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-labelledby={titleId}
      onClose={() => { onClose(); returnTo.current?.focus?.(); }}
      onClick={e => { if (e.target === ref.current) ref.current?.close(); }}>
      {open && (
        <div className="dialog-body">
          <div className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={() => ref.current?.close()} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Clipboard write; success is reported only after the promise resolves. */
export async function copyText(text) {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy button with a visible selectable-text fallback when the clipboard is unavailable.
 * @param {{text: string, label: string, announce: (m: string) => void, className?: string, doneLabel?: string}} props
 */
export function CopyButton({ text, label, announce, className = 'btn btn-secondary', doneLabel = 'Copied' }) {
  const [state, setState] = useState(/** @type {'idle'|'done'|'fallback'} */ ('idle'));
  const area = useRef(/** @type {HTMLTextAreaElement|null} */ (null));
  useEffect(() => { setState('idle'); }, [text]);
  useEffect(() => {
    if (state === 'fallback' && area.current) { area.current.focus(); area.current.select(); }
    if (state !== 'done') return;
    const t = setTimeout(() => setState('idle'), 2500);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <>
      <button type="button" className={className} onClick={async () => {
        const ok = await copyText(text);
        setState(ok ? 'done' : 'fallback');
        announce(ok ? 'Copied to clipboard.' : 'Copy is unavailable. The text is selected below; copy it manually.');
      }}>
        <Icon name={state === 'done' ? 'check' : 'copy'} />
        {state === 'done' ? doneLabel : label}
      </button>
      {state === 'fallback' && (
        <div className="copy-fallback">
          <label>Copy this text manually
            <textarea ref={area} readOnly value={text} rows={Math.min(8, text.split('\n').length + 1)} />
          </label>
        </div>
      )}
    </>
  );
}

/** Local QR generation with stale-result protection. Never overlays a logo. */
export function QrCode({ payload, label }) {
  const [src, setSrc] = useState(/** @type {string|null} */ (null));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setSrc(null); setFailed(false);
    import('qrcode').then(QR => (QR.default ?? QR).toDataURL(payload, {
      errorCorrectionLevel: 'M', margin: 4, width: 320, color: { dark: '#000000', light: '#FFFFFF' },
    })).then(url => { if (live) setSrc(url); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [payload]);
  if (failed) return <p className="field-error">The QR code could not be generated. Use Copy instead.</p>;
  return (
    <figure className="qr">
      {src ? <img src={src} width="240" height="240" alt={`QR code. ${label}`} /> : <div className="qr-placeholder" aria-hidden="true" />}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
