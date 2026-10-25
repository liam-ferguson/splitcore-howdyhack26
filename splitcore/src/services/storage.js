// Optional, opt-in local storage. Every access is failure tolerant: if storage is
// missing, blocked or corrupt, the app keeps working in memory.

import { fromDraft, toDraft } from '../state.js';

const K = { prefs: 'splitcore:v1:prefs', names: 'splitcore:v1:names', draft: 'splitcore:v1:draft', payment: 'splitcore:v1:payment' };
const MAX_DRAFT_BYTES = 200_000;

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @returns {boolean} whether the write succeeded */
function write(key, value) {
  try {
    const text = JSON.stringify(value);
    if (text.length > MAX_DRAFT_BYTES) return false;
    window.localStorage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try { window.localStorage.removeItem(key); return true; } catch { return false; }
}

/** @returns {{rememberNames: boolean, rememberDraft: boolean, rememberPayment: boolean}} */
export function loadPrefs() {
  const p = read(K.prefs);
  return { rememberNames: p?.rememberNames === true, rememberDraft: p?.rememberDraft === true, rememberPayment: p?.rememberPayment === true };
}

export function savePrefs(prefs) {
  return write(K.prefs, { rememberNames: !!prefs.rememberNames, rememberDraft: !!prefs.rememberDraft, rememberPayment: !!prefs.rememberPayment });
}

/** Opt-in: the payer's own payment method and handle (never anyone else's). */
export function loadPayment() {
  const v = read(K.payment);
  if (!v || !['paypal', 'venmo', 'cashapp'].includes(v.method) || typeof v.handle !== 'string' || v.handle.length > 200) return null;
  return { method: v.method, handle: v.handle, profileUrl: '' };
}
export function savePayment(payment) { return write(K.payment, { method: payment.method, handle: payment.handle }); }
export function clearPayment() { return remove(K.payment); }

/** @returns {string[]} */
export function loadNames() {
  const n = read(K.names);
  if (!Array.isArray(n)) return [];
  return n.filter(x => typeof x === 'string' && x.trim() && x.length <= 40).slice(0, 30);
}

export function saveNames(names) {
  return write(K.names, names.slice(0, 30));
}

export function clearNames() { return remove(K.names); }

/** Load and validate the sanitized draft, or null. */
export function loadDraft() {
  return fromDraft(read(K.draft));
}

export function saveDraft(bill) {
  return write(K.draft, toDraft(bill));
}

export function clearDraft() { return remove(K.draft); }

/** Remove only SplitCore's keys. */
export function clearAll() {
  return [K.prefs, K.names, K.draft, K.payment].map(remove).every(Boolean);
}
