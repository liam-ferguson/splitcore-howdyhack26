// Integer-cent money helpers. No floating-point arithmetic touches amounts.

/** Upper bound for any single amount or aggregate, in cents ($100,000.00). */
export const MAX_CENTS = 10_000_000;

const MONEY_RE = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parse user-entered dollars into integer cents.
 * Accepts `12`, `12.3`, `12.30`, `$12.30`, `1,234.56`. Rejects negatives,
 * exponents, malformed grouping, more than two decimals and out-of-bound values.
 * @param {string} input
 * @returns {number|null} cents, or null when invalid
 */
export function parseCents(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  const m = MONEY_RE.exec(s);
  if (!m) return null;
  const wholeDigits = m[1].replace(/,/g, '');
  if (wholeDigits.length > 9) return null;
  const whole = Number(wholeDigits);
  const frac = m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0'));
  const cents = whole * 100 + frac;
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return cents;
}

/** @param {unknown} v */
export function isValidCents(v) {
  return Number.isSafeInteger(v) && /** @type {number} */ (v) >= 0 && /** @type {number} */ (v) <= MAX_CENTS;
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/**
 * Presentation only. Negative amounts use a true minus sign.
 * @param {number} cents
 */
export function formatMoney(cents) {
  if (!Number.isSafeInteger(cents)) return '—';
  const abs = Math.abs(cents);
  const text = fmt.format(Math.floor(abs / 100) + (abs % 100) / 100);
  return cents < 0 ? `−${text}` : text;
}

/**
 * Plain `dollars.cc` text without locale separators, built from integers.
 * Used for URLs, payloads and input defaults.
 * @param {number} cents nonnegative integer
 */
export function centsToPlain(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Invalid cents');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/**
 * Largest-remainder apportionment of `total` cents by integer weights.
 * Ties go to the lower `order`. Sum of the result always equals `total`.
 * @param {number} total
 * @param {{id: string, weight: number, order: number}[]} entries
 * @returns {Record<string, number>}
 */
export function apportion(total, entries) {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid total');
  for (const e of entries) {
    if (!Number.isSafeInteger(e.weight) || e.weight < 0) throw new Error('Invalid weight');
  }
  if (new Set(entries.map(e => e.id)).size !== entries.length) throw new Error('Duplicate id');
  const W = entries.reduce((s, e) => s + BigInt(e.weight), 0n);
  if (total === 0) return Object.fromEntries(entries.map(e => [e.id, 0]));
  if (W === 0n) throw new Error('Choose who covers the remaining charges');
  const rows = entries.map(e => {
    const product = BigInt(total) * BigInt(e.weight);
    return { ...e, cents: Number(product / W), remainder: product % W };
  });
  const left = total - rows.reduce((s, e) => s + e.cents, 0);
  const ranked = rows.filter(e => e.weight > 0).sort((a, b) =>
    a.remainder === b.remainder ? a.order - b.order :
    a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < left; i++) ranked[i].cents++;
  return Object.fromEntries(rows.map(e => [e.id, e.cents]));
}
