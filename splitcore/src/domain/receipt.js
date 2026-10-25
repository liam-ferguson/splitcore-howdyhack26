// Deterministic receipt text parser and bill reconciliation.
// parseReceipt takes ONLY text: never a filename, mode flag or fixture object.

import { MAX_CENTS, formatMoney, parseCents } from './money.js';

/**
 * @typedef {{id: string, order: number, name: string, quantity: number,
 *   grossCents: number, sourceLine: string, unitPriceCents: number|null,
 *   needsReview: boolean, reviewReason?: string}} Item
 * @typedef {{id: string, cents: number, scope: 'bill'|'item'|'unresolved',
 *   itemId: string|null, label: string, sourceLine: string}} Discount
 * @typedef {{id: string, code: string, severity: 'blocking'|'info',
 *   line?: string, field?: string, message: string,
 *   candidates?: {label: string, cents: number}[], cents?: number|null,
 *   name?: string}} Issue
 * @typedef {'taxCents'|'serviceCents'|'includedTipCents'|'receiptTotalCents'|'printedSubtotalCents'} SummaryField
 */

export const SUMMARY_FIELDS = /** @type {const} */ ([
  'taxCents', 'serviceCents', 'includedTipCents', 'receiptTotalCents', 'printedSubtotalCents',
]);

export const FIELD_LABELS = {
  taxCents: 'Tax',
  serviceCents: 'Service & fees',
  includedTipCents: 'Printed tip',
  receiptTotalCents: 'Receipt total',
  printedSubtotalCents: 'Printed subtotal',
};

/** Empty receipt used for manual entry and as the parser's base. */
export function emptyReceipt() {
  return {
    merchant: '', merchantEdited: false,
    /** @type {string[]} */ headerLines: [],
    /** @type {string[]} */ domains: [],
    /** @type {null|'none'|string} */ rewardsChoice: null,
    dateText: '', timeText: '', storeNumber: '', orderNumber: '',
    /** @type {Item[]} */ items: [],
    /** @type {Discount[]} */ discounts: [],
    taxCents: 0, serviceCents: 0, includedTipCents: 0,
    listed: { tax: false, service: false, tip: false },
    /** @type {number|null} */ printedSubtotalCents: null,
    /** @type {number|null} */ receiptTotalCents: null,
    totalSource: /** @type {'ocr'|'manual'|'missing'} */ ('missing'),
    extraTipCents: 0,
    /** @type {number|null} */ finalPaidCents: null,
    paidConfirmed: false,
    chargeBasis: /** @type {'food'|'equalConfirmed'} */ ('food'),
    /** @type {Issue[]} */ issues: [],
    sampleDisclaimer: false,
  };
}

/**
 * Normalize OCR/pasted text while preserving line boundaries.
 * Never rewrites letters to digits or invents decimal points.
 * @param {string} text
 * @returns {string[]} nonempty trimmed lines
 */
export function normalizeLines(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[   \t]/g, ' ')
    .replace(/[−‒–—―]/g, '-')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .split('\n')
    .map(l => l.replace(/ {2,}/g, ' ').trim().replace(/^\|+\s*/, '').replace(/\s*\|+$/, '').trim())
    .filter(l => l && !/^[-=*_.~#+\s]+$/.test(l));
}

const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}`;
// Rightmost strict currency amount, optional sign forms and trailing tax marker.
const AMOUNT_RE = new RegExp(
  String.raw`(?:^|\s)(\(\s*-?\$?\s?${NUM}\s*\)|-?\s?\$?\s?-?\s?${NUM}-?)(?:\s+(?:[A-Z]{1,2}|USD))?$`
);
const STRICT_ANYWHERE = new RegExp(String.raw`\d\.\d{2}(?!\d)`);

/**
 * Find a strict rightmost currency amount.
 * @param {string} line
 * @returns {{label: string, cents: number|null, negative: boolean}|null}
 */
export function splitAmount(line) {
  const m = AMOUNT_RE.exec(line);
  if (!m) return null;
  const token = m[1];
  const negative = /[-(]/.test(token);
  const digits = token.replace(/[()$\s-]/g, '');
  const cents = parseCents(digits);
  const label = line.slice(0, m.index).replace(/[.:\s]+$/, '').replace(/\.{2,}/g, ' ').trim();
  return { label, cents, negative };
}

const DISCLAIMER_RE = /FICTIONAL TEST RECEIPT|NOT VALID FOR|SAMPLE ONLY|DO NOT SUBMIT|SAMPLE RECEIPT/i;
const DATE_RE = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/;
const TIME_RE = /\b(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\b/i;
const STORE_RE = /^(?:STORE|RESTAURANT|REST|LOCATION|LOC)\b\s*(?:#|NO\.?|NUMBER)?\s*:?\s*([A-Z0-9][A-Z0-9-]*)$/i;
const ORDER_RE = /^(?:ORDER|ORD|CHECK|CHK|TICKET)\b\s*(?:#|NO\.?|NUMBER)?\s*:?\s*([A-Z0-9][A-Z0-9-]*)$/i;
const INFO_RE = /^(?:DATE|TIME|TABLE|SERVER|GUESTS?|CASHIER|REGISTER|TERMINAL|TRANS(?:ACTION)?|THANK|WWW|HTTPS?|TEL|PHONE)\b/i;
const BOILERPLATE_RE = /^(?:WELCOME|THANK|THANKS|RECEIPT|CUSTOMER COPY|MERCHANT COPY|GUEST CHECK|DINE ?-?IN|TAKE ?-?OUT|TO ?GO|CARRY ?OUT|DRIVE ?-?THRU|DELIVERY|PICK ?UP|ORDER|TABLE|SERVER|CASHIER|DUPLICATE|REPRINT|COPY|SALE|INVOICE|BILL)\b/i;
const DOMAIN_RE = /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)*([a-z0-9-]+\.(?:com|net|org|us|co))\b/gi;
const HAS_DOMAIN = /\b[a-z0-9-]+\.(?:com|net|org|us|co)\b/i;

const SUBTOTAL_RE = /^SUB\s*-?\s*TOTAL\b/;
const TOTAL_RE = /^(?:(?:GRAND|TAKE\s?-?\s?OUT|DINE\s?-?\s?IN|ORDER|CHECK|BILL)\s+)?TOTAL(?:\s+(?:DUE|USD|AMOUNT))?$|^(?:AMOUNT|BALANCE|TOTAL)\s+DUE$/;
const TAX_RE = /^(?:[A-Z]+\s+)?(?:SALES\s+)?TAX(?:ES)?\b/;
const SERVICE_RE = /^(?:\d+%\s+|AUTO(?:MATIC)?\s+|INCLUDED\s+)?(?:SERVICE(?:\s+(?:CHARGE|FEE))?|GRATUITY)\b|^(?:DELIVERY|CONVENIENCE|BAG|SMALL ORDER|ONLINE ORDER|PACKAGING|PLATFORM|KITCHEN|HEALTH|LIVING WAGE|CREDIT CARD|CARD)\s+(?:FEE|CHARGE|SURCHARGE)S?\b|^(?:SURCHARGE|FEES?)$/;
const TIP_RE = /^(?:ADDED\s+)?TIPS?(?:\s+AMOUNT)?$/;
const NONCHARGE_RE = /^(?:CASH|CHANGE|TENDER(?:ED)?|AMOUNT TENDERED|AMT TENDERED|VISA|MASTER\s?CARD|MC|AMEX|AMERICAN EXPRESS|DISCOVER|CREDIT|DEBIT|CARD|AUTH\w*|APPROV\w*|PAYMENT|PAID|GIFT CARD|(?:AMOUNT|TOTAL)\s+PAID|ROUNDING|(?:APPLE|GOOGLE|SAMSUNG)\s+PAY|BALANCE(?!\s+DUE))\b|SUGGEST|%|\bRATE\b/;
const DISCOUNT_RE = /\b(?:DISCOUNT|DISC|COUPON|PROMO|PROMOTION|SAVINGS|SAVED|SAVE|OFF|COMP|REWARD)\b/;

/** Uppercase, collapse to letters/digits/spaces for label matching. */
function key(label) {
  return label.toUpperCase().replace(/[^A-Z0-9%#@]+/g, ' ').trim();
}

/** Does a header line look like a business name rather than an address, phone or boilerplate? */
function merchantCandidate(line) {
  const s = line.replace(/^WELCOME\s+TO\s+/i, '').replace(/[*=~_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  const visible = s.replace(/\s/g, '').length;
  if (letters < 3 || letters / Math.max(1, visible) < 0.6) return null;
  if (/^WELCOME\b/i.test(line) && s === line.trim()) return null;
  if (BOILERPLATE_RE.test(s) || INFO_RE.test(s)) return null;
  if (/^\d+\s+\S/.test(s)) return null; // street address
  if (/\d{3}[-. )]\s?\d{3}[-. ]\d{4}/.test(s)) return null; // phone
  if (/,\s*[A-Z]{2}\s+\d{5}/.test(s) || /\b\d{5}(?:-\d{4})?$/.test(s)) return null; // city, ST 77840
  if (/\d[.,]\d/.test(s)) return null;
  return s.slice(0, 60);
}

/**
 * Parse receipt text into structured candidates plus semantic issues.
 * @param {string} text
 */
export function parseReceipt(text) {
  const r = emptyReceipt();
  const lines = normalizeLines(text);
  let itemSeq = 0, discSeq = 0, issueSeq = 0;
  const nextIssue = () => `x${++issueSeq}`;
  /** @type {Record<string, {label: string, cents: number, line: string}[]>} */
  const summary = { taxCents: [], serviceCents: [], includedTipCents: [], receiptTotalCents: [], printedSubtotalCents: [] };
  /** @type {{label: string, cents: number, negative: boolean, line: string}[]} */
  const discountLines = [];
  let sawMoney = false, seenTotal = false, sawItem = false;

  const unknown = (line, message, cents = null, name = '', severity = 'blocking') => {
    r.issues.push({ id: nextIssue(), code: 'unknown-line', severity, line, message, cents, name });
  };

  // Websites printed anywhere (header or footer) are strong restaurant evidence.
  const domains = new Set();
  for (const line of lines) for (const m of line.matchAll(DOMAIN_RE)) domains.add(m[1].toLowerCase());
  r.domains = [...domains].slice(0, 6);

  for (const line of lines) {
    if (DISCLAIMER_RE.test(line)) { r.sampleDisclaimer = true; continue; }
    const amt = splitAmount(line);

    if (!amt) {
      // Metadata and plain text lines. Keep explicit labelled strings only.
      const upper = line.toUpperCase();
      let meta = false;
      const date = DATE_RE.exec(line);
      if (date && !r.dateText) { r.dateText = date[1]; meta = true; }
      const time = TIME_RE.exec(line);
      if (time && (/\bTIME\b/i.test(line) || date) && !r.timeText) { r.timeText = time[1]; meta = true; }
      const store = STORE_RE.exec(line);
      if (store) { if (!r.storeNumber) r.storeNumber = store[1]; meta = true; }
      const order = ORDER_RE.exec(line);
      if (order) { if (!r.orderNumber) r.orderNumber = order[1]; meta = true; }
      if (meta || date) continue;

      if (!sawMoney) {
        if (r.headerLines.length < 8) r.headerLines.push(line.slice(0, 80));
        if (!r.merchant) {
          const name = merchantCandidate(line);
          if (name) { r.merchant = name; continue; }
        }
      }
      if (INFO_RE.test(line)) continue;
      const k = key(line);
      const withoutRates = upper.replace(/\d+(?:\.\d+)?\s*%/g, '');
      if (NONCHARGE_RE.test(k)) continue;
      const summaryLabel = SUBTOTAL_RE.test(k) || TOTAL_RE.test(k.replace(/\s*\d.*$/, '')) ||
        TAX_RE.test(k) || SERVICE_RE.test(k) || /^TIPS?\b/.test(k);
      const moneyLooking = /\d[.,]\d{1,3}\b/.test(withoutRates) || /\$\s?\d/.test(withoutRates) ||
        ((sawItem || summaryLabel) && /[A-Za-z]/.test(line) && /\s\d{3,6}-?$/.test(withoutRates));
      if (moneyLooking && /[A-Za-z]/.test(line) && !HAS_DOMAIN.test(line)) {
        unknown(line, summaryLabel
          ? 'This summary line has an amount we could not read. Enter it in the bill details.'
          : "Couldn't read a price on this line. Add it as an item or exclude it.",
          null, line.replace(/[\d.,$\s-]+$/, '').trim(), seenTotal ? 'info' : 'blocking');
      }
      continue;
    }

    sawMoney = true;
    const { label, cents, negative } = amt;
    const k = key(label);
    if (cents === null || cents > MAX_CENTS) { unknown(line, 'This amount is too large or malformed.'); continue; }

    if (SUBTOTAL_RE.test(k)) { summary.printedSubtotalCents.push({ label, cents, line }); continue; }
    if (TOTAL_RE.test(k)) { summary.receiptTotalCents.push({ label, cents, line }); seenTotal = true; continue; }
    if (TAX_RE.test(k) && !/\bRATE\b/.test(k)) { summary.taxCents.push({ label, cents, line }); continue; }
    if (SERVICE_RE.test(k) && !/SUGGEST/.test(k)) { summary.serviceCents.push({ label, cents, line }); continue; }
    if (TIP_RE.test(k)) { summary.includedTipCents.push({ label, cents, line }); continue; }
    if (NONCHARGE_RE.test(k)) continue; // tender, change, card, suggested tip, rates
    if (DISCOUNT_RE.test(k) || negative) {
      if (cents === 0) continue; // a $0.00 promo line changes nothing
      if (seenTotal) {
        r.issues.push({ id: nextIssue(), code: 'after-total-saving', severity: 'info', line,
          message: 'A savings line after the total was not applied. The printed total already reflects it.' });
        continue;
      }
      discountLines.push({ label, cents, negative, line });
      continue;
    }
    if (seenTotal) {
      // Lines after the total are almost always payment details; keep them visible but non-blocking.
      unknown(line, 'A priced line after the total was not counted. Add it as an item only if it’s food.', cents, label, 'info');
      continue;
    }
    if (!/[A-Za-z]/.test(label)) { unknown(line, 'This price has no item name.', cents, ''); continue; }
    if (STRICT_ANYWHERE.test(label.replace(/@\s*\$?\d+\.\d{2}$/, ''))) {
      unknown(line, 'Several prices on one line (multi-column layout). Add each item separately.', null, '');
      continue;
    }

    const item = parseItemLabel(label, cents);
    if (!item) { unknown(line, 'This line could not be read as an item.', cents, label); continue; }
    sawItem = true;
    r.items.push({ id: `i${++itemSeq}`, order: r.items.length, sourceLine: line, grossCents: cents, ...item });
  }

  // Summary fields. Distinct labelled tax or fee lines (STATE TAX + CITY TAX, DELIVERY FEE +
  // SERVICE FEE) are separate charges and are added, with a visible note. Repeats of the same
  // label, or conflicting totals and subtotals, need a decision.
  for (const field of SUMMARY_FIELDS) {
    const found = summary[field];
    if (!found.length) continue;
    if (field === 'taxCents') r.listed.tax = true;
    if (field === 'serviceCents') r.listed.service = true;
    if (field === 'includedTipCents') r.listed.tip = true;
    if (field === 'receiptTotalCents') r.totalSource = 'ocr';
    const distinctValues = new Set(found.map(f => f.cents));
    const distinctLabels = new Set(found.map(f => key(f.label)));
    const summable = field === 'taxCents' || field === 'serviceCents';
    if (found.length === 1 || (!summable && distinctValues.size === 1)) {
      r[field] = found[0].cents;
      continue;
    }
    const sum = found.reduce((s, f) => s + f.cents, 0);
    if (summable && distinctLabels.size === found.length && sum <= MAX_CENTS) {
      r[field] = sum;
      r.issues.push({ id: nextIssue(), code: 'summed-lines', severity: 'info', field,
        message: `Added ${found.map(f => `${f.label} ${formatMoney(f.cents)}`).join(' + ')} = ${formatMoney(sum)} as ${FIELD_LABELS[field].toLowerCase()}.` });
      continue;
    }
    r[field] = found[0].cents;
    const candidates = found.map(f => ({ label: `${f.label} ${formatMoney(f.cents)}`, cents: f.cents }));
    if (summable && sum <= MAX_CENTS) candidates.push({ label: `Add them: ${formatMoney(sum)}`, cents: sum });
    r.issues.push({ id: nextIssue(), code: 'duplicate-field', severity: 'blocking', field,
      line: found.map(f => f.line).join(' / '),
      message: `Several ${FIELD_LABELS[field].toLowerCase()} lines were found. Choose the right amount.`,
      candidates });
  }

  // Discount scope: exact unique item-name target, explicit bill label, otherwise unresolved.
  for (const d of discountLines) {
    const base = { id: `d${++discSeq}`, cents: d.cents, label: d.label || 'Unlabeled discount', sourceLine: d.line };
    const k = key(d.label);
    const named = /^(.*?)\s*\b(?:DISCOUNT|DISC)$/.exec(k);
    if (/^(?:BILL|RECEIPT|CHECK|ORDER|TOTAL)\s+(?:DISCOUNT|DISC)$/.test(k)) {
      r.discounts.push({ ...base, scope: 'bill', itemId: null });
    } else if (named && named[1]) {
      const matches = r.items.filter(i => key(i.name) === named[1]);
      if (matches.length === 1) r.discounts.push({ ...base, scope: 'item', itemId: matches[0].id });
      else r.discounts.push({ ...base, scope: 'unresolved', itemId: null });
    } else {
      r.discounts.push({ ...base, scope: 'unresolved', itemId: null });
    }
  }
  // Give issue fields stable ids for focus targets.
  for (const i of r.issues) if (i.code === 'unknown-line') i.field = `issue:${i.id}`;
  return r;
}

/**
 * Supported quantity forms. Returns null when no item name remains.
 * @param {string} label text left of the extended amount
 * @param {number} extended line total in cents
 */
export function parseItemLabel(label, extended) {
  let m;
  let quantity = 1, name = label, unitPriceCents = null, needsReview = false, reviewReason = '';
  if ((m = /^(\d{1,3})\s+(.+?)\s*@\s*\$?((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})$/.exec(label))) {
    quantity = Number(m[1]); name = m[2]; unitPriceCents = parseCents(m[3]);
    if (unitPriceCents === null || unitPriceCents * quantity !== extended) {
      needsReview = true;
      reviewReason = `Quantity × unit price doesn't equal the ${formatMoney(extended)} line total.`;
    }
  } else if ((m = /^(\d{1,3})\s*[xX×]\s+(.+)$/.exec(label))) {
    quantity = Number(m[1]); name = m[2];
  } else if ((m = /^(.+?)\s+[xX×]\s?(\d{1,3})$/.exec(label))) {
    name = m[1]; quantity = Number(m[2]);
  } else if ((m = /^(\d{1,3})\s+(.+)$/.exec(label))) {
    quantity = Number(m[1]); name = m[2];
  }
  name = name.replace(/^[+*•·>-]+\s*/, '').replace(/[.\s]+$/, '').trim();
  if (!/[A-Za-z]/.test(name)) return null;
  if (quantity < 1 || quantity > 20) {
    needsReview = true;
    reviewReason = `Quantity ${quantity} is outside 1–20. Check this line.`;
    name = label;
    quantity = 1;
    unitPriceCents = null;
  }
  return { name: name.slice(0, 60), quantity, unitPriceCents, needsReview, reviewReason };
}

/**
 * Recompute arithmetic and scope checks from current canonical fields.
 * Stored semantic issues (unknown lines, duplicate labels) are included as-is.
 * @param {ReturnType<typeof emptyReceipt>} r
 */
export function validateReceipt(r) {
  /** @type {Issue[]} */
  const issues = [...r.issues];
  const itemsById = new Map(r.items.map(i => [i.id, i]));
  const G = r.items.reduce((s, i) => s + i.grossCents, 0);
  let I = 0, B = 0, U = 0;
  /** @type {Map<string, number>} */
  const perItem = new Map();
  for (const d of r.discounts) {
    if (d.scope === 'bill') B += d.cents;
    else if (d.scope === 'item' && d.itemId && itemsById.has(d.itemId)) {
      I += d.cents;
      perItem.set(d.itemId, (perItem.get(d.itemId) ?? 0) + d.cents);
    } else {
      U += d.cents;
      const missing = d.scope === 'item';
      issues.push({ id: `scope-${d.id}`, code: missing ? 'discount-target' : 'discount-scope', severity: 'blocking',
        field: `discount:${d.id}`, line: d.sourceLine,
        message: missing
          ? `The item for “${d.label}” was removed. Choose what this ${formatMoney(d.cents)} discount applies to.`
          : `Choose what “${d.label}” (${formatMoney(d.cents)}) applies to: the whole bill or one item.` });
    }
  }
  for (const [itemId, cents] of perItem) {
    const item = /** @type {Item} */ (itemsById.get(itemId));
    if (cents > item.grossCents) {
      issues.push({ id: `over-${itemId}`, code: 'discount-exceeds-item', severity: 'blocking', field: `item:${itemId}`,
        message: `Discounts on ${item.name} (${formatMoney(cents)}) exceed its ${formatMoney(item.grossCents)} line total.` });
    }
  }
  const totalDiscount = I + B + U;
  if (totalDiscount > G) {
    issues.push({ id: 'over-food', code: 'discount-exceeds-food', severity: 'blocking', field: 'discounts',
      message: `Discounts (${formatMoney(totalDiscount)}) exceed the food total (${formatMoney(G)}).` });
  }
  for (const i of r.items) {
    if (i.needsReview) {
      issues.push({ id: `review-${i.id}`, code: 'item-review', severity: 'blocking', field: `item:${i.id}`, line: i.sourceLine,
        message: `${i.name}: ${i.reviewReason || 'check quantity and line total.'}` });
    }
  }
  if (!r.items.length) {
    issues.push({ id: 'no-items', code: 'no-items', severity: 'blocking', field: 'items',
      message: 'No items yet. Add the items from the receipt.' });
  }

  const T = r.taxCents, S = r.serviceCents, P = r.includedTipCents;
  const expected = G - totalDiscount + T + S + P;
  const total = r.receiptTotalCents;
  let reconciled = false;
  if (total === null) {
    issues.push({ id: 'missing-total', code: 'missing-total', severity: 'blocking', field: 'receiptTotalCents',
      message: 'No receipt total was found. Enter the total printed on the receipt.' });
  } else if (expected !== total) {
    const diff = Math.abs(expected - total);
    issues.push({ id: 'mismatch', code: 'mismatch', severity: 'blocking', field: 'receiptTotalCents',
      message: `Items and charges are ${formatMoney(diff)} ${expected < total ? 'below' : 'above'} the receipt total. Review the highlighted lines.` });
  } else {
    reconciled = true;
  }

  /** @type {'none'|'net'|'gross'|'itemNet'|'unresolved'} */
  let subtotalBasis = 'none';
  const sub = r.printedSubtotalCents;
  if (sub !== null) {
    if (sub === G - totalDiscount) subtotalBasis = 'net';
    else if (sub === G) subtotalBasis = 'gross';
    else if (sub === G - I) subtotalBasis = 'itemNet';
    else {
      subtotalBasis = 'unresolved';
      issues.push({ id: 'subtotal', code: 'subtotal', severity: 'blocking', field: 'printedSubtotalCents',
        message: `The printed subtotal ${formatMoney(sub)} matches neither items (${formatMoney(G)}) nor items after discounts (${formatMoney(G - totalDiscount)}). Correct an item or the subtotal.` });
    }
  }

  // Paid amount: one explicit confirmation; extra tip only by user classification.
  /** @type {{state: 'missing'|'more'|'reclassify'|'less'|'unconfirmed'|'ok'|'waiting', delta: number}} */
  let paid = { state: 'waiting', delta: 0 };
  if (total !== null) {
    const target = total + r.extraTipCents;
    const fp = r.finalPaidCents;
    if (fp === null) paid = { state: 'missing', delta: 0 };
    else if (fp > target) paid = { state: 'more', delta: fp - total };
    else if (fp < target && fp >= total && r.extraTipCents > 0) paid = { state: 'reclassify', delta: fp - total };
    else if (fp < target) paid = { state: 'less', delta: target - fp };
    else if (!r.paidConfirmed) paid = { state: 'unconfirmed', delta: 0 };
    else paid = { state: 'ok', delta: 0 };
  }

  const blocking = issues.filter(i => i.severity === 'blocking');
  return { issues, blocking, G, I, B, U, T, S, P, expected, reconciled: reconciled && !blocking.length, arithmeticMatches: reconciled, subtotalBasis, paid };
}
