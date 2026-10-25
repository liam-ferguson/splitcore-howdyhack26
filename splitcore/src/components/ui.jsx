import React, { Component, createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { centsToPlain, formatMoney, parseCents } from '../domain/money.js';

/** Original minimal icons. Decorative unless a label is given. */
export function Icon({ name, size = 20, label, className = '' }) {
  const paths = {
    camera: <><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
    image: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 16l5-5 4 4 2-2 5 5" /><circle cx="15.5" cy="9.5" r="1.5" /></>,
    upload: <><path d="M12 15V4" /><path d="M7.5 8.5L12 4l4.5 4.5" /><path d="M5 14v5h14v-5" /></>,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    share: <><path d="M12 15V4" /><path d="M8 8l4-4 4 4" /><path d="M5 12v7h14v-7" /></>,
    arrow: <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
    back: <><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2.5" /><path d="M5 15V6a1 1 0 0 1 1-1h9" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    close: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
    alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>,
    text: <><path d="M5 6h14" /><path d="M5 11h14" /><path d="M5 16h9" /></>,
    rotate: <><path d="M5 12a7 7 0 1 0 2-5" /><path d="M5 4v4h4" /></>,
    star: <path d="M12 4l2.4 5 5.6.7-4.1 3.8 1 5.5-4.9-2.7-4.9 2.7 1-5.5L4 9.7 9.6 9z" />,
    sparkle: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="M12 8.5l1.2 2.3 2.3 1.2-2.3 1.2L12 15.5l-1.2-2.3L8.5 12l2.3-1.2z" /></>,
    receipt: <><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" /><path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h3" /></>,
    gift: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 9h18v-3H3z" /><path d="M12 6v14" /><path d="M12 6c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1z" /></>,
    crown: <path d="M4 18h16l1-10-5 4-4-6-4 6-5-4z" />,
    search: <><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" /></>,
    external: <><path d="M14 5h5v5" /><path d="M19 5l-8 8" /><path d="M17 14v5H5V7h5" /></>,
    chevron: <path d="M9 6l6 6-6 6" />,
    trash: <><path d="M5 7h14" /><path d="M9 7V5h6v2" /><path d="M7 7l1 12h8l1-12" /></>,
    edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
    users: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /><circle cx="17" cy="8" r="2.4" /><path d="M16 13.2c2.3-.2 4 1.2 4.6 3.8" /></>,
    shield: <><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>,
    bolt: <path d="M13 3L5 13h6l-1 8 8-10h-6z" />,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" /></>,
    qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></>,
    info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
    wallet: <><rect x="3.5" y="6" width="17" height="13" rx="2.5" /><path d="M16 12.5h4.5" /><path d="M6 6l9-3 1 3" /></>,
    pie: <><path d="M12 3v9h9a9 9 0 1 1-9-9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></>,
  };
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label} focusable="false">
      {paths[name]}
    </svg>
  );
}

/** Animated split-circle brand mark: two original halves that part and rejoin. */
export function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="logo">
      <defs>
        <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C8FF4D" /><stop offset="1" stopColor="#5CE1FF" /></linearGradient>
        <linearGradient id="lg-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#A99BFF" /><stop offset="1" stopColor="#FF7AB8" /></linearGradient>
      </defs>
      <path className="logo-l" d="M15 2a14 14 0 0 0 0 28z" fill="url(#lg-a)" />
      <path className="logo-r" d="M17 2a14 14 0 0 1 0 28z" fill="url(#lg-b)" />
    </svg>
  );
}

// ---------- People colors ----------
export const PERSON_COLORS = ['#C8FF4D', '#5CE1FF', '#A99BFF', '#FF7AB8', '#FFB347', '#4BF2B0', '#7AA7FF', '#FF8A6B', '#FFE164', '#D59CFF', '#3FE0D0', '#FF9EC4'];
/** Stable color per diner, from creation order. */
export const personColor = order => PERSON_COLORS[((order % PERSON_COLORS.length) + PERSON_COLORS.length) % PERSON_COLORS.length];
export const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

export function Avatar({ name, order, size = 36, payer = false }) {
  return (
    <span className="avatar" style={{ '--pc': personColor(order), '--s': `${size}px` }} aria-hidden="true">
      {initials(name)}
      {payer && <span className="avatar-crown"><Icon name="crown" size={11} /></span>}
    </span>
  );
}

// ---------- Motion helpers ----------
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Money that eases to its new value. Display only — the exact cents are in data-cents and the
 * screen-reader text, and the final frame always shows the exact amount.
 */
export function AnimatedMoney({ cents, className = '', duration = 700 }) {
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);
  useEffect(() => {
    const start = from.current;
    if (start === cents || reducedMotion()) { from.current = cents; setShown(cents); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(start + (cents - start) * eased);
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else { from.current = cents; setShown(cents); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [cents, duration]);
  return (
    <span className={`money ${className}`} data-cents={cents}>
      <span aria-hidden="true">{formatMoney(shown)}</span>
      <span className="sr-only">{formatMoney(cents)}</span>
    </span>
  );
}

/** Circular progress. */
export function ProgressRing({ value, max, size = 64, stroke = 7, children, done }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const gid = `ring-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <span className={`ring ${done ? 'ring-done' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C8FF4D" /><stop offset=".55" stopColor="#5CE1FF" /><stop offset="1" stopColor="#A99BFF" /></linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bar" stroke={`url(#${gid})`} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="ring-label">{children}</span>
    </span>
  );
}

/** Horizontal stacked bar of shares. */
export function SplitBar({ segments, label }) {
  const total = segments.reduce((s, x) => s + x.cents, 0);
  return (
    <div className="splitbar" role="img" aria-label={label}>
      {total > 0 && segments.filter(s => s.cents > 0).map(s => (
        <span key={s.id} className="splitbar-seg" style={{ width: `${(s.cents / total) * 100}%`, background: s.color }} />
      ))}
    </div>
  );
}

/** Donut chart of shares; segments draw in on mount. */
export function Donut({ segments, size = 168, stroke = 18, label, children }) {
  const total = segments.reduce((s, x) => s + x.cents, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const gap = segments.filter(s => s.cents > 0).length > 1 ? 3 : 0;
  return (
    <figure className="donut" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
        {total > 0 && segments.filter(s => s.cents > 0).map((s, i) => {
          const len = (s.cents / total) * c;
          const el = (
            <circle key={s.id} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} className="donut-seg" style={{ '--i': i, '--len': len }} />
          );
          offset += len;
          return el;
        })}
      </svg>
      <span className="donut-center">{children}</span>
    </figure>
  );
}

/** One-shot celebratory particle burst (decorative; disabled for reduced motion). */
export function Burst({ fire }) {
  if (!fire) return null;
  const dots = Array.from({ length: 22 }, (_, i) => {
    const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.2;
    const dist = 70 + (i * 37) % 90;
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, c: PERSON_COLORS[i % PERSON_COLORS.length], d: (i % 5) * 30 };
  });
  return (
    <span className="burst" aria-hidden="true" key={fire}>
      {dots.map((p, i) => <span key={i} style={{ '--x': `${p.x}px`, '--y': `${p.y}px`, '--c': p.c, '--d': `${p.d}ms` }} />)}
    </span>
  );
}

// ---------- Forms ----------
/** Registry of fields currently holding invalid text, so settlement can be blocked. */
export const InvalidFields = createContext(/** @type {{set: (id: string, bad: boolean) => void}} */ ({ set: () => {} }));

/**
 * Money input that keeps a string draft and commits integer cents only when valid.
 * @param {{id: string, label: string, cents: number|null, onCommit: (c: number|null) => void,
 *   allowEmpty?: boolean, hint?: string, error?: string, highlight?: boolean, className?: string, placeholder?: string}} props
 */
export function MoneyField({ id, label, cents, onCommit, allowEmpty = false, hint, error, highlight, className = '', placeholder }) {
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
        <input id={id} inputMode="decimal" autoComplete="off" value={text} placeholder={placeholder}
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
 * Renders as a bottom sheet on phones and a centered panel on larger screens.
 * @param {{open: boolean, onClose: () => void, title: string, children: any, wide?: boolean, icon?: string}} props
 */
export function Dialog({ open, onClose, title, children, wide, icon }) {
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
      onClose={() => {
        onClose();
        // Return focus to the opener; if the action removed it (e.g. "Remove person"), fall back to the page.
        const el = returnTo.current;
        if (el && el.isConnected) el.focus();
        else requestAnimationFrame(() => { const opener = returnTo.current; if (opener?.isConnected) opener.focus(); else document.getElementById('main')?.focus({ preventScroll: true }); });
      }}
      onClick={e => { if (e.target === ref.current) ref.current?.close(); }}>
      {open && (
        <div className="dialog-body">
          <div className="dialog-head">
            <h2 id={titleId}>{icon && <span className="dialog-icon"><Icon name={icon} size={18} /></span>}{title}</h2>
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
 * @param {{text: string, label: string, announce: (m: string) => void, className?: string, doneLabel?: string, icon?: string}} props
 */
export function CopyButton({ text, label, announce, className = 'btn btn-secondary', doneLabel = 'Copied', icon = 'copy' }) {
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
      <button type="button" className={`${className} ${state === 'done' ? 'is-done' : ''}`} onClick={async () => {
        const ok = await copyText(text);
        setState(ok ? 'done' : 'fallback');
        announce(ok ? 'Copied to clipboard.' : 'Copy is unavailable. The text is selected below; copy it manually.');
      }}>
        <Icon name={state === 'done' ? 'check' : icon} />
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

/** Toast stack. Polite, dismissible, with an optional action (e.g. Undo). */
export function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.tone ?? 'info'}`} role="status">
          <Icon name={t.tone === 'success' ? 'check' : t.tone === 'warn' ? 'alert' : 'sparkle'} />
          <span className="toast-text">{t.text}</span>
          {t.action && <button type="button" className="toast-action" onClick={() => { t.action.run(); onDismiss(t.id); }}>{t.action.label}</button>}
          <button type="button" className="icon-btn icon-btn-sm" aria-label="Dismiss" onClick={() => onDismiss(t.id)}><Icon name="close" size={16} /></button>
        </div>
      ))}
    </div>
  );
}

/** Keeps a render error from blanking the whole app. */
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('SplitCore UI error', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash card" role="alert">
        <h1>Something went wrong on this screen.</h1>
        <p className="muted">Your bill is still in memory. Try again, or reload to start fresh.</p>
        <div className="row-wrap">
          <button type="button" className="btn btn-primary" onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}>Try again</button>
          <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
