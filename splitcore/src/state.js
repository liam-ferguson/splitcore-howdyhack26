// Canonical bill state: one reducer, boundary validation, no derived money stored.

import { MAX_CENTS, isValidCents } from './domain/money.js';
import { emptyReceipt, SUMMARY_FIELDS } from './domain/receipt.js';
import { unitKey } from './domain/split.js';
import { DEMO_DINERS } from './demo/receipts.js';

export const MAX_DINERS = 12;
export const MAX_ITEMS = 100;
export const MAX_NAME = 40;
export const MAX_ITEM_NAME = 60;

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * @typedef {ReturnType<typeof emptyReceipt>} Receipt
 * @typedef {{id: string, name: string, order: number}} Diner
 * @typedef {{
 *   schemaVersion: 1, mode: 'real'|'demo', step: 'snap'|'claim'|'settle',
 *   source: {kind: 'none'|'image'|'text'|'manual'|'draft', rawText: string, fileName: string, sampleText: boolean, loadId: number},
 *   receipt: Receipt, diners: Diner[], payerId: string|null,
 *   claims: Record<string, string[]>,
 *   payment: {method: 'none'|'paypal'|'venmo'|'cashapp', handle: string, profileUrl: string},
 *   notices: Record<string, string>, nextOrder: number, restoredDraft: boolean
 * }} Bill
 */

/** @param {'real'|'demo'} mode @returns {Bill} */
export function newBill(mode = 'real') {
  return {
    schemaVersion: 1, mode, step: 'snap',
    source: { kind: 'none', rawText: '', fileName: '', sampleText: false, loadId: 0, imageUrl: '' },
    receipt: emptyReceipt(), diners: [], payerId: null, claims: {},
    payment: { method: 'none', handle: '', profileUrl: '' },
    notices: {}, nextOrder: 0, restoredDraft: false,
  };
}

/** Demo draft: prefilled diners and payer, nothing claimed, nothing confirmed. */
export function newDemoBill() {
  const b = newBill('demo');
  b.diners = DEMO_DINERS.map((name, order) => ({ id: `demo-${order}`, name, order }));
  b.payerId = b.diners[0].id;
  b.nextOrder = b.diners.length;
  return b;
}

/** Initial app state. Real and demo bills live side by side in memory. */
export function initialState(realBill = newBill('real')) {
  return { mode: /** @type {'real'|'demo'} */ ('real'), real: realBill, demo: /** @type {Bill|null} */ (null) };
}

const cleanName = s => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Money edits invalidate the paid confirmation. */
function money(receipt, patch) {
  return { ...receipt, ...patch, paidConfirmed: false };
}

/** Remove claims that reference a missing item/unit and drop unknown diner IDs. */
function pruneClaims(claims, receipt, diners) {
  const valid = new Set(receipt.items.flatMap(i => Array.from({ length: i.quantity }, (_, k) => unitKey(i.id, k))));
  const ids = new Set(diners.map(d => d.id));
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [k, owners] of Object.entries(claims)) {
    if (!valid.has(k)) continue;
    const o = [...new Set(owners.filter(id => ids.has(id)))];
    if (o.length) out[k] = o;
  }
  return out;
}

/**
 * Bill reducer. Every action returns a new bill.
 * @param {Bill} bill
 * @param {any} a
 * @returns {Bill}
 */
export function billReducer(bill, a) {
  const r = bill.receipt;
  switch (a.type) {
    case 'LOAD_RECEIPT': {
      const receipt = { ...a.receipt, finalPaidCents: null, paidConfirmed: false, extraTipCents: 0 };
      return { ...bill, receipt, claims: {}, notices: {}, step: 'claim', restoredDraft: false,
        source: { kind: a.kind, rawText: a.rawText ?? '', fileName: a.fileName ?? '', sampleText: !!a.sampleText, loadId: (bill.source.loadId ?? 0) + 1,
          imageUrl: typeof a.imageUrl === 'string' && a.imageUrl.startsWith('blob:') ? a.imageUrl : '' } };
    }
    case 'SET_STEP': return { ...bill, step: a.step };
    case 'SET_MERCHANT': {
      const merchant = cleanName(a.merchant).slice(0, 60);
      if (merchant === r.merchant) return bill;
      return { ...bill, receipt: { ...r, merchant, merchantEdited: true, rewardsChoice: null } };
    }
    case 'SET_REWARDS_CHOICE': {
      const choice = a.choice === null || a.choice === 'none' || typeof a.choice === 'string' ? a.choice : null;
      return { ...bill, receipt: { ...r, rewardsChoice: choice } };
    }

    case 'ADD_ITEM': {
      if (r.items.length >= MAX_ITEMS) return bill;
      const item = {
        id: uid(), order: Math.max(-1, ...r.items.map(i => i.order)) + 1,
        name: cleanName(a.name).slice(0, MAX_ITEM_NAME) || 'Item', quantity: clampQty(a.quantity),
        grossCents: isValidCents(a.grossCents) ? a.grossCents : 0, sourceLine: a.sourceLine ?? '',
        unitPriceCents: null, needsReview: !!a.needsReview, reviewReason: a.reviewReason ?? '',
      };
      return { ...bill, receipt: money(r, { items: [...r.items, item] }) };
    }
    case 'UPDATE_ITEM': {
      const old = r.items.find(i => i.id === a.id);
      if (!old) return bill;
      const p = a.patch;
      const next = { ...old };
      let notices = bill.notices, claims = bill.claims, financial = false;
      if ('name' in p) next.name = cleanName(p.name).slice(0, MAX_ITEM_NAME) || old.name;
      if ('grossCents' in p && isValidCents(p.grossCents) && p.grossCents !== old.grossCents) {
        next.grossCents = p.grossCents; next.unitPriceCents = null; next.needsReview = false; financial = true;
      }
      if ('quantity' in p) {
        const q = clampQty(p.quantity);
        if (q !== old.quantity) {
          next.quantity = q; next.unitPriceCents = null; next.needsReview = false; financial = true;
          claims = Object.fromEntries(Object.entries(claims).filter(([k]) => !k.startsWith(`${old.id}:`)));
          notices = { ...notices, [old.id]: 'Quantity changed — claims for this line were cleared.' };
        }
      }
      const items = r.items.map(i => i.id === a.id ? next : i);
      return { ...bill, claims, notices, receipt: financial ? money(r, { items }) : { ...r, items } };
    }
    case 'MARK_ITEM_OK':
      return { ...bill, receipt: money(r, { items: r.items.map(i => i.id === a.id ? { ...i, needsReview: false, reviewReason: '' } : i) }) };
    case 'DELETE_ITEM': {
      const items = r.items.filter(i => i.id !== a.id);
      const claims = Object.fromEntries(Object.entries(bill.claims).filter(([k]) => !k.startsWith(`${a.id}:`)));
      const { [a.id]: _gone, ...notices } = bill.notices;
      return { ...bill, claims, notices, receipt: money(r, { items }) };
    }
    case 'DISMISS_NOTICE': {
      const { [a.id]: _gone, ...notices } = bill.notices;
      return { ...bill, notices };
    }

    case 'ADD_DISCOUNT': {
      const d = { id: uid(), cents: isValidCents(a.cents) ? a.cents : 0, scope: a.scope ?? 'bill', itemId: a.itemId ?? null, label: cleanName(a.label) || 'Discount', sourceLine: '' };
      return { ...bill, receipt: money(r, { discounts: [...r.discounts, d] }) };
    }
    case 'UPDATE_DISCOUNT': {
      const discounts = r.discounts.map(d => {
        if (d.id !== a.id) return d;
        const n = { ...d };
        if ('cents' in a.patch && isValidCents(a.patch.cents)) n.cents = a.patch.cents;
        if ('scope' in a.patch) {
          if (a.patch.scope === 'bill') { n.scope = 'bill'; n.itemId = null; }
          else if (a.patch.scope === 'item' && r.items.some(i => i.id === a.patch.itemId)) { n.scope = 'item'; n.itemId = a.patch.itemId; }
        }
        if ('label' in a.patch) n.label = cleanName(a.patch.label) || d.label;
        return n;
      });
      return { ...bill, receipt: money(r, { discounts }) };
    }
    case 'DELETE_DISCOUNT': return { ...bill, receipt: money(r, { discounts: r.discounts.filter(d => d.id !== a.id) }) };

    case 'SET_CHARGE': {
      if (!SUMMARY_FIELDS.includes(a.field)) return bill;
      const value = a.cents === null && (a.field === 'printedSubtotalCents' || a.field === 'receiptTotalCents') ? null
        : isValidCents(a.cents) ? a.cents : undefined;
      if (value === undefined) return bill;
      const patch = { [a.field]: value, issues: r.issues.filter(i => !(i.code === 'duplicate-field' && i.field === a.field)) };
      if (a.field === 'receiptTotalCents') patch.totalSource = value === null ? 'missing' : 'manual';
      if (a.field === 'taxCents') patch.listed = { ...r.listed, tax: true };
      if (a.field === 'serviceCents') patch.listed = { ...r.listed, service: true };
      if (a.field === 'includedTipCents') patch.listed = { ...r.listed, tip: true };
      return { ...bill, receipt: money(r, patch) };
    }
    case 'RESOLVE_ISSUE': {
      const issue = r.issues.find(i => i.id === a.id);
      if (!issue) return bill;
      const issues = r.issues.filter(i => i.id !== a.id);
      if (a.action === 'choose' && issue.field && isValidCents(a.cents)) {
        const patch = { [issue.field]: a.cents, issues };
        if (issue.field === 'receiptTotalCents') patch.totalSource = 'ocr';
        return { ...bill, receipt: money(r, patch) };
      }
      if (a.action === 'ignore') return { ...bill, receipt: money(r, { issues }) };
      if (a.action === 'add-item') {
        const added = billReducer({ ...bill, receipt: { ...r, issues } }, {
          type: 'ADD_ITEM', name: issue.name || 'Item', quantity: 1, grossCents: issue.cents ?? 0, sourceLine: issue.line,
          needsReview: issue.cents == null, reviewReason: 'Enter the line total from the receipt.',
        });
        return added;
      }
      return bill;
    }

    case 'SET_PAID': return { ...bill, receipt: money(r, { finalPaidCents: isValidCents(a.cents) ? a.cents : null }) };
    case 'CLASSIFY_EXTRA_TIP': {
      if (r.finalPaidCents === null || r.receiptTotalCents === null || r.finalPaidCents < r.receiptTotalCents) return bill;
      return { ...bill, receipt: money(r, { extraTipCents: r.finalPaidCents - r.receiptTotalCents }) };
    }
    case 'CLEAR_EXTRA_TIP': return { ...bill, receipt: money(r, { extraTipCents: 0 }) };
    case 'CONFIRM_PAID': {
      const ok = r.finalPaidCents !== null && r.receiptTotalCents !== null && r.finalPaidCents === r.receiptTotalCents + r.extraTipCents;
      return ok ? { ...bill, receipt: { ...r, paidConfirmed: true } } : bill;
    }
    case 'SET_CHARGE_BASIS': return { ...bill, receipt: { ...r, chargeBasis: a.basis === 'equalConfirmed' ? 'equalConfirmed' : 'food' } };

    case 'ADD_DINER': {
      const name = cleanName(a.name).slice(0, MAX_NAME);
      if (!name || bill.diners.length >= MAX_DINERS) return bill;
      if (bill.diners.some(d => d.name.toLowerCase() === name.toLowerCase())) return bill;
      const d = { id: uid(), name, order: bill.nextOrder };
      return { ...bill, diners: [...bill.diners, d], nextOrder: bill.nextOrder + 1, payerId: bill.payerId ?? d.id };
    }
    case 'RENAME_DINER': {
      const name = cleanName(a.name).slice(0, MAX_NAME);
      if (!name || bill.diners.some(d => d.id !== a.id && d.name.toLowerCase() === name.toLowerCase())) return bill;
      return { ...bill, diners: bill.diners.map(d => d.id === a.id ? { ...d, name } : d) };
    }
    case 'REMOVE_DINER': {
      const diners = bill.diners.filter(d => d.id !== a.id);
      const claims = Object.fromEntries(Object.entries(bill.claims).map(([k, o]) => [k, o.filter(id => id !== a.id)]).filter(([, o]) => o.length));
      return { ...bill, diners, claims, payerId: bill.payerId === a.id ? null : bill.payerId };
    }
    case 'SET_PAYER': return bill.diners.some(d => d.id === a.id) ? { ...bill, payerId: a.id } : bill;

    case 'TOGGLE_CLAIM': {
      if (!bill.diners.some(d => d.id === a.dinerId)) return bill;
      const cur = bill.claims[a.key] ?? [];
      const next = cur.includes(a.dinerId) ? cur.filter(id => id !== a.dinerId) : [...cur, a.dinerId];
      return { ...bill, claims: setClaim(bill.claims, a.key, next) };
    }
    case 'CLAIM_ONLY':
      return bill.diners.some(d => d.id === a.dinerId) ? { ...bill, claims: setClaim(bill.claims, a.key, [a.dinerId]) } : bill;
    case 'SHARE_ALL': return { ...bill, claims: setClaim(bill.claims, a.key, bill.diners.map(d => d.id)) };
    case 'CLEAR_CLAIM': return { ...bill, claims: setClaim(bill.claims, a.key, []) };

    case 'SET_PAYMENT': return { ...bill, payment: { ...bill.payment, ...a.payment } };
    default: return bill;
  }
}

function setClaim(claims, key, owners) {
  const next = { ...claims };
  if (owners.length) next[key] = [...new Set(owners)]; else delete next[key];
  return next;
}

function clampQty(q) {
  const n = Number(q);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : 1;
}

/**
 * App reducer: routes bill actions to the active mode's bill.
 * @param {ReturnType<typeof initialState>} state
 * @param {any} a
 */
export function appReducer(state, a) {
  switch (a.type) {
    case 'ENTER_DEMO': return { ...state, mode: 'demo', demo: state.demo ?? newDemoBill() };
    case 'EXIT_DEMO': return { ...state, mode: 'real' };
    case 'RESET_DEMO': return { ...state, mode: 'demo', demo: newDemoBill() };
    case 'RESET_REAL': return { ...state, real: newBill('real') };
    case 'RESTORE_DRAFT': return { ...state, mode: 'real', real: a.bill };
    case 'SET_BILL': return a.mode === 'demo' || a.mode === 'real' ? { ...state, [a.mode]: a.bill } : state;
    default: {
      const key = state.mode;
      const bill = state[key] ?? newBill(key);
      const next = billReducer(bill, a);
      return next === bill ? state : { ...state, [key]: next };
    }
  }
}

// ---------- Persistence boundary ----------

const isStr = (v, max) => typeof v === 'string' && v.length <= max;

/**
 * Sanitized draft for optional local storage: item/charge/claim data and diner names only.
 * Excludes merchant transaction IDs, date/time, raw source lines, OCR text and payment details.
 * @param {Bill} bill
 */
export function toDraft(bill) {
  const r = bill.receipt;
  return {
    schemaVersion: 1,
    receipt: {
      merchant: r.merchant, merchantEdited: r.merchantEdited, rewardsChoice: r.rewardsChoice,
      items: r.items.map(({ id, order, name, quantity, grossCents }) => ({ id, order, name, quantity, grossCents })),
      discounts: r.discounts.map(({ id, cents, scope, itemId, label }) => ({ id, cents, scope, itemId, label })),
      taxCents: r.taxCents, serviceCents: r.serviceCents, includedTipCents: r.includedTipCents,
      printedSubtotalCents: r.printedSubtotalCents, receiptTotalCents: r.receiptTotalCents,
      extraTipCents: r.extraTipCents, finalPaidCents: r.finalPaidCents, chargeBasis: r.chargeBasis,
    },
    diners: bill.diners.map(({ id, name, order }) => ({ id, name, order })),
    payerId: bill.payerId, claims: bill.claims,
  };
}

/**
 * Validate an untrusted stored draft. Returns a bill or null; never throws.
 * Paid confirmation is always required again.
 * @param {unknown} raw
 * @returns {Bill|null}
 */
export function fromDraft(raw) {
  try {
    const d = /** @type {any} */ (raw);
    if (!d || d.schemaVersion !== 1 || typeof d.receipt !== 'object' || !Array.isArray(d.diners)) return null;
    const x = d.receipt;
    if (!Array.isArray(x.items) || x.items.length < 1 || x.items.length > MAX_ITEMS) return null;
    if (!Array.isArray(x.discounts) || x.discounts.length > MAX_ITEMS) return null;
    if (d.diners.length > MAX_DINERS) return null;
    const itemIds = new Set();
    let gross = 0;
    const items = x.items.map(i => {
      if (!isStr(i.id, 80) || itemIds.has(i.id) || !isStr(i.name, MAX_ITEM_NAME) || !i.name.trim()) throw 0;
      if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 20 || !isValidCents(i.grossCents) || !Number.isSafeInteger(i.order)) throw 0;
      itemIds.add(i.id); gross += i.grossCents;
      return { id: i.id, order: i.order, name: i.name, quantity: i.quantity, grossCents: i.grossCents, sourceLine: '', unitPriceCents: null, needsReview: false, reviewReason: '' };
    });
    if (gross > MAX_CENTS) return null;
    const discounts = x.discounts.map(dd => {
      if (!isStr(dd.id, 80) || !isValidCents(dd.cents) || !['bill', 'item', 'unresolved'].includes(dd.scope)) throw 0;
      // An item discount whose item was deleted stays an item discount with no target, so the
      // restored bill shows the same "choose what this applies to" issue instead of being rejected.
      const itemId = dd.scope === 'item' && itemIds.has(dd.itemId) ? dd.itemId : null;
      return { id: dd.id, cents: dd.cents, scope: dd.scope, itemId, label: isStr(dd.label, 80) ? dd.label : 'Discount', sourceLine: '' };
    });
    for (const f of ['taxCents', 'serviceCents', 'includedTipCents', 'extraTipCents']) if (!isValidCents(x[f])) return null;
    for (const f of ['printedSubtotalCents', 'receiptTotalCents', 'finalPaidCents']) if (x[f] !== null && !isValidCents(x[f])) return null;
    const dinerIds = new Set(), names = new Set(), orders = new Set();
    const diners = d.diners.map(p => {
      if (!isStr(p.id, 80) || !isStr(p.name, MAX_NAME) || !p.name.trim() || !Number.isSafeInteger(p.order)) throw 0;
      if (dinerIds.has(p.id) || names.has(p.name.toLowerCase()) || orders.has(p.order)) throw 0;
      dinerIds.add(p.id); names.add(p.name.toLowerCase()); orders.add(p.order);
      return { id: p.id, name: p.name, order: p.order };
    });
    if (typeof d.claims !== 'object' || d.claims === null) return null;
    /** @type {Record<string, string[]>} */
    const claims = {};
    for (const [k, owners] of Object.entries(d.claims)) {
      if (!Array.isArray(owners) || owners.some(id => !dinerIds.has(id)) || new Set(owners).size !== owners.length) return null;
      claims[k] = owners;
    }
    const receipt = {
      ...emptyReceipt(),
      merchant: isStr(x.merchant, 60) ? x.merchant : '',
      merchantEdited: x.merchantEdited === true,
      rewardsChoice: x.rewardsChoice === 'none' || (isStr(x.rewardsChoice, 40) && /^[a-z]+$/.test(x.rewardsChoice)) ? x.rewardsChoice : null,
      items, discounts,
      taxCents: x.taxCents, serviceCents: x.serviceCents, includedTipCents: x.includedTipCents,
      listed: { tax: x.taxCents > 0, service: x.serviceCents > 0, tip: x.includedTipCents > 0 },
      printedSubtotalCents: x.printedSubtotalCents, receiptTotalCents: x.receiptTotalCents,
      totalSource: x.receiptTotalCents === null ? 'missing' : 'manual',
      extraTipCents: x.extraTipCents, finalPaidCents: x.finalPaidCents, paidConfirmed: false,
      chargeBasis: x.chargeBasis === 'equalConfirmed' ? 'equalConfirmed' : 'food',
    };
    const bill = newBill('real');
    return {
      ...bill, step: 'claim', receipt, diners,
      payerId: dinerIds.has(d.payerId) ? d.payerId : null,
      claims: pruneClaims(claims, receipt, diners),
      nextOrder: Math.max(-1, ...diners.map(p => p.order)) + 1,
      source: { kind: 'draft', rawText: '', fileName: '', sampleText: false, loadId: 1, imageUrl: '' },
      restoredDraft: true,
    };
  } catch {
    return null;
  }
}
