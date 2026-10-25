// Payment handoff strings, demo payloads and reminder text. Pure and testable.
// These are prepared requests only: nothing here processes or verifies a payment.

import { centsToPlain, formatMoney } from './money.js';

const PAYPAL_HANDLE = /^[A-Za-z0-9]{1,20}$/;
const VENMO_USER = /^@?[A-Za-z0-9_-]{5,30}$/;
const CASHTAG = /^\$?(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{1,20}$/;

const HOSTS = {
  paypal: ['paypal.me', 'www.paypal.me'],
  venmo: ['venmo.com', 'www.venmo.com', 'account.venmo.com'],
  cashapp: ['cash.app', 'www.cash.app'],
};

/**
 * Strict HTTPS URL check against an exact host allowlist.
 * Returns the trimmed input unchanged when valid.
 * @param {string} input
 * @param {'paypal'|'venmo'|'cashapp'} provider
 * @returns {{ok: true, url: string, host: string} | {ok: false, error: string}}
 */
export function validateProviderUrl(input, provider) {
  const s = String(input ?? '').trim();
  if (!s) return { ok: false, error: 'Enter a link.' };
  if (/[\s\\<>"'`]/.test(s) || /[\u0000-\u001F\u007F]/.test(s)) return { ok: false, error: 'This link contains characters that are not allowed.' };
  let u;
  try { u = new URL(s); } catch { return { ok: false, error: 'This is not a valid link.' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'Only https:// links are accepted.' };
  if (u.username || u.password) return { ok: false, error: 'Links with sign-in details are not accepted.' };
  if (u.port) return { ok: false, error: 'Links with a custom port are not accepted.' };
  if (!HOSTS[provider].includes(u.hostname.toLowerCase())) {
    return { ok: false, error: `Only links on ${HOSTS[provider].join(', ')} are accepted. Your handle can still be copied.` };
  }
  try { decodeURIComponent(u.pathname); decodeURIComponent(u.search); } catch { return { ok: false, error: 'This link has malformed encoding.' }; }
  return { ok: true, url: s, host: u.hostname.toLowerCase() };
}

/**
 * Accept a PayPal.Me handle or a paypal.me URL; return the normalized base for review.
 * Syntax check only: it does not establish that the account exists or belongs to anyone.
 * @param {string} input
 * @returns {{ok: true, handle: string, base: string, stripped: boolean} | {ok: false, error: string}}
 */
export function normalizePaypal(input) {
  const s = String(input ?? '').trim();
  if (PAYPAL_HANDLE.test(s)) return { ok: true, handle: s, base: `https://paypal.me/${s}`, stripped: false };
  if (/^(?:https?:\/\/)?(?:www\.)?paypal\.me\//i.test(s)) {
    const v = validateProviderUrl(/^https?:/i.test(s) ? s : `https://${s}`, 'paypal');
    if (!v.ok) return v;
    const u = new URL(v.url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length || !PAYPAL_HANDLE.test(parts[0])) return { ok: false, error: 'PayPal.Me names are 1–20 letters or numbers.' };
    return { ok: true, handle: parts[0], base: `https://paypal.me/${parts[0]}`, stripped: parts.length > 1 || !!u.search || !!u.hash };
  }
  return { ok: false, error: 'Enter a PayPal.Me name (1–20 letters or numbers) or a paypal.me link.' };
}

/**
 * Documented PayPal.Me amount link. Zero or negative means no request.
 * @param {string} handle
 * @param {number} cents
 */
export function paypalLink(handle, cents) {
  if (!PAYPAL_HANDLE.test(handle)) throw new Error('Invalid PayPal.Me name');
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return `https://paypal.me/${handle}/${centsToPlain(cents)}USD`;
}

/** @param {string} s */
export function normalizeVenmo(s) {
  const t = String(s ?? '').trim();
  if (!VENMO_USER.test(t)) return { ok: false, error: 'Venmo usernames are 5–30 letters, numbers, - or _.' };
  return { ok: true, handle: `@${t.replace(/^@/, '')}` };
}

/** @param {string} s */
export function normalizeCashtag(s) {
  const t = String(s ?? '').trim();
  if (!CASHTAG.test(t)) return { ok: false, error: 'Cashtags are 1–20 letters or numbers, with at least one letter.' };
  return { ok: true, handle: `$${t.replace(/^\$/, '')}` };
}

/**
 * Validate the payer's payment settings.
 * @param {{method: 'none'|'paypal'|'venmo'|'cashapp', handle: string, profileUrl: string}} payment
 */
export function checkPayment(payment) {
  const method = payment?.method ?? 'none';
  if (method === 'none') return { ok: true, method };
  if (method === 'paypal') {
    const p = normalizePaypal(payment.handle);
    return p.ok ? { ok: true, method, handle: p.handle, base: p.base, stripped: p.stripped } : { ok: false, method, error: p.error };
  }
  const h = method === 'venmo' ? normalizeVenmo(payment.handle) : normalizeCashtag(payment.handle);
  if (!h.ok) return { ok: false, method, error: h.error };
  return { ok: true, method, handle: h.handle };
}

/**
 * Venmo payment link with the amount and note prefilled. venmo.com/{user}?txn=pay redirects to
 * Venmo's own account.venmo.com/payment-link page (checked October 24, 2026); in the Venmo app it
 * opens the pay screen. The payer still reviews and confirms inside Venmo.
 * @param {string} handle "@user" or "user"
 * @param {number} cents
 * @param {string} note
 */
export function venmoLink(handle, cents, note) {
  const user = String(handle).replace(/^@/, '');
  if (!VENMO_USER.test(user)) throw new Error('Invalid Venmo username');
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  const q = new URLSearchParams({ txn: 'pay', amount: centsToPlain(cents), note: note.slice(0, 120) });
  return `https://venmo.com/${encodeURIComponent(user)}?${q.toString().replace(/\+/g, '%20')}`;
}

/**
 * Cash App's documented payment link is cash.app/$cashtag (the amount is entered in Cash App;
 * an amount in the URL is not documented, so none is added).
 * @param {string} handle "$tag" or "tag"
 */
export function cashAppLink(handle) {
  const tag = String(handle).replace(/^\$/, '');
  if (!CASHTAG.test(tag)) throw new Error('Invalid cashtag');
  return `https://cash.app/$${tag}`;
}

/** Short item summary for a person's message. */
function itemSummary(person) {
  return person.lines.map(l => `${l.label} ${formatMoney(l.grossCents)}`).join(', ');
}

/** Nonzero charge buckets as [label, cents]. */
function chargeParts(person) {
  return [
    ['tax', person.taxCents], ['service', person.serviceCents],
    ['included tip', person.includedTipCents], ['extra tip', person.extraTipCents],
    ['receipt adjustment', person.adjustmentCents ?? 0],
  ].filter(([, c]) => c !== 0);
}

/**
 * Exact demo QR text. Text only: it cannot transfer money.
 * @param {{name: string, totalCents: number, netFoodCents: number} & Record<string, any>} person
 */
export function demoPayload(person) {
  const parts = [`Food ${centsToPlain(person.netFoodCents)}`, ...chargeParts(person).map(([l, c]) => `${l} ${centsToPlain(c)}`)];
  return `SPLITCORE DEMO | No payment | ${person.name} | USD ${centsToPlain(person.totalCents)} | ${parts.join(' + ')} | Sample only`;
}

/**
 * Everything the Settle card needs for one non-payer diner. Links use the handle the payer
 * entered (also in demo mode — it's their own account); without a handle, demo shows a text QR.
 * @param {{person: any, payerName: string, merchant: string, payment: any, demo: boolean}} args
 */
export function buildRequest({ person, payerName, merchant, payment, demo }) {
  const total = person.totalCents;
  const amount = formatMoney(total);
  const pay = checkPayment(payment);
  const note = `${merchant || 'Dinner'} split (SplitCore)`;
  /** @type {{href: string, label: string, provider: string, amountIncluded: boolean}|null} */
  let link = null;
  let qrPayload = null, qrLabel = '', payInfo = '', copyHandle = '';

  if (total > 0 && pay.ok && pay.method !== 'none') {
    if (pay.method === 'paypal') {
      const href = /** @type {string} */ (paypalLink(pay.handle, total));
      link = { href, label: `Pay ${amount} with PayPal`, provider: 'PayPal', amountIncluded: true };
    } else if (pay.method === 'venmo') {
      const href = /** @type {string} */ (venmoLink(pay.handle, total, note));
      link = { href, label: `Pay ${amount} on Venmo`, provider: 'Venmo', amountIncluded: true };
      copyHandle = pay.handle;
    } else {
      link = { href: cashAppLink(pay.handle), label: `Pay ${pay.handle} on Cash App`, provider: 'Cash App', amountIncluded: false };
      copyHandle = pay.handle;
    }
    payInfo = `on ${link.provider}: ${link.href}`;
    qrPayload = link.href;
    qrLabel = link.amountIncluded ? `Scan to pay ${payerName} ${amount} on ${link.provider}.` : `Scan to open ${pay.handle} on Cash App, then enter ${amount}.`;
  } else if (demo && total > 0) {
    qrPayload = demoPayload(person);
    qrLabel = 'Demo QR — contains a sample breakdown, not a payment link.';
  }

  const charges = chargeParts(person).map(([l, c]) => `${l} ${formatMoney(c)}`);
  const lines = [
    `Hey ${person.name}! Your share at ${merchant || 'dinner'} is ${amount}. ${itemSummary(person)}.`,
    `Food after discounts ${formatMoney(person.netFoodCents)}${charges.length ? `; ${charges.join('; ')}` : ''}.`,
    total > 0 ? `Please send ${amount} to ${payerName}${payInfo ? ` ${payInfo}` : ''}. Thanks!` : 'Nothing to send. Thanks!',
  ];
  let message = lines.join('\n');
  if (demo) message = `DEMO — sample receipt.\n${message}`;
  return { amount, link, qrPayload, qrLabel, message, copyHandle, paymentError: pay.ok ? null : pay.error };
}
