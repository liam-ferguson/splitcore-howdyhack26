// Unit expansion and exact-cent bill allocation. Pure: no React, no browser globals.

import { apportion, formatMoney } from './money.js';
import { validateReceipt } from './receipt.js';

/**
 * @typedef {{key: string, itemId: string, index: number, quantity: number, name: string,
 *   grossCents: number, discountCents: number, netCents: number}} Unit
 * @typedef {{id: string, name: string, order: number}} Diner
 */

export const unitKey = (itemId, index) => `${itemId}:${index}`;

/**
 * Split each extended line total into units and spread item discounts over them.
 * The stored price is the extended line amount; it is never multiplied by quantity.
 * @param {{items: import('./receipt.js').Item[], discounts: import('./receipt.js').Discount[]}} receipt
 * @returns {Unit[]}
 */
export function expandUnits(receipt) {
  const items = [...receipt.items].sort((a, b) => a.order - b.order);
  /** @type {Unit[]} */
  const units = [];
  for (const item of items) {
    const idx = Array.from({ length: item.quantity }, (_, i) => i);
    const gross = apportion(item.grossCents, idx.map(i => ({ id: String(i), weight: 1, order: i })));
    const D = receipt.discounts
      .filter(d => d.scope === 'item' && d.itemId === item.id)
      .reduce((s, d) => s + d.cents, 0);
    const disc = D > 0 && D <= item.grossCents
      ? apportion(D, idx.map(i => ({ id: String(i), weight: gross[i], order: i })))
      : Object.fromEntries(idx.map(i => [String(i), 0]));
    for (const i of idx) {
      units.push({
        key: unitKey(item.id, i), itemId: item.id, index: i, quantity: item.quantity, name: item.name,
        grossCents: gross[i], discountCents: disc[i], netCents: gross[i] - disc[i],
      });
    }
  }
  return units;
}

/** Owners of a unit, restricted to existing diners, unique, in stable diner order. */
function ownersOf(claims, key, dinerOrder) {
  const ids = new Set((claims[key] ?? []).filter(id => dinerOrder.has(id)));
  return [...ids].sort((a, b) => /** @type {number} */ (dinerOrder.get(a)) - /** @type {number} */ (dinerOrder.get(b)));
}

/** Human label for one person's piece of one unit. */
function shareLabel(unit, ownerCount) {
  const base = unit.quantity > 1 ? `${unit.name} ${unit.index + 1} of ${unit.quantity}` : unit.name;
  return ownerCount > 1 ? `1/${ownerCount} of ${base}` : base;
}

/**
 * Full bill allocation. Returns provisional food subtotals until everything
 * reconciles, every unit is claimed and the paid amount is confirmed.
 * @param {{receipt: ReturnType<typeof import('./receipt.js').emptyReceipt>, diners: Diner[], payerId: string|null, claims: Record<string, string[]>}} bill
 */
export function allocateBill(bill) {
  const { receipt, payerId, claims } = bill;
  const diners = [...bill.diners].sort((a, b) => a.order - b.order);
  const dinerOrder = new Map(diners.map(d => [d.id, d.order]));
  const allIds = diners.map(d => d.id);
  const check = validateReceipt(receipt);
  const units = expandUnits(receipt);

  /** @type {Record<string, {key: string, label: string, grossCents: number, discountCents: number, netCents: number, owners: number, shared: boolean}[]>} */
  const lines = Object.fromEntries(diners.map(d => [d.id, []]));
  // Units nobody tapped are shared evenly by everyone at the table (no "assign everything" chore).
  const unclaimed = [];
  for (const u of units) {
    let owners = ownersOf(claims, u.key, dinerOrder);
    const shared = owners.length === 0;
    if (shared) {
      if (u.grossCents > 0) unclaimed.push(u);
      owners = allIds;
    }
    if (!owners.length) continue;
    const w = owners.map(id => ({ id, weight: 1, order: /** @type {number} */ (dinerOrder.get(id)) }));
    const g = apportion(u.grossCents, w);
    const n = apportion(u.netCents, w);
    for (const id of owners) {
      if (u.grossCents === 0 && shared) continue; // free, untapped: nothing to show
      lines[id].push({ key: u.key, label: shareLabel(u, owners.length), grossCents: g[id], discountCents: g[id] - n[id], netCents: n[id], owners: owners.length, shared });
    }
  }

  const provisional = diners.map(d => ({
    id: d.id, name: d.name, order: d.order,
    foodCents: lines[d.id].reduce((s, l) => s + l.grossCents, 0),
  }));
  const unclaimedFoodCents = unclaimed.reduce((s, u) => s + u.grossCents, 0);
  const requiredUnits = units.filter(u => u.grossCents > 0).length;

  /** @type {{code: string, message: string, field?: string}[]} */
  const blockers = check.blocking.map(i => ({ code: i.code, message: i.message, field: i.field }));
  if (!diners.length) blockers.push({ code: 'no-diners', message: 'Add the people at the table.', field: 'diners' });
  else if (!payerId || !dinerOrder.has(payerId)) blockers.push({ code: 'no-payer', message: 'Choose who paid the bill.', field: 'payer' });

  const base = { check, units, unclaimed, unclaimedFoodCents, provisional, requiredUnits, claimedUnits: requiredUnits - unclaimed.length };
  if (blockers.length) return { ...base, ready: false, blockers, needsEqualCharges: false };

  // Bill discounts proportional to food after item discounts.
  const foodBefore = Object.fromEntries(diners.map(d => [d.id, lines[d.id].reduce((s, l) => s + l.netCents, 0)]));
  const billDisc = apportion(check.B, diners.map(d => ({ id: d.id, weight: foodBefore[d.id], order: d.order })));
  const netFood = Object.fromEntries(diners.map(d => [d.id, foodBefore[d.id] - billDisc[d.id]]));

  // Each charge bucket independently, weights frozen at net food. If food is $0 (fully comped),
  // charges are split equally — the only fair default with nothing to weigh by.
  const adj = check.adjustmentCents;
  const buckets = { tax: receipt.taxCents, service: receipt.serviceCents, includedTip: receipt.includedTipCents, extraTip: receipt.extraTipCents, adjustment: Math.abs(adj) };
  const foodSum = diners.reduce((s, d) => s + netFood[d.id], 0);
  const equalCharges = foodSum === 0;
  const weights = diners.map(d => ({ id: d.id, weight: equalCharges ? 1 : netFood[d.id], order: d.order }));
  const alloc = Object.fromEntries(Object.entries(buckets).map(([k, total]) => [k, apportion(total, weights)]));
  const sign = adj < 0 ? -1 : 1;

  const people = diners.map(d => {
    const gross = lines[d.id].reduce((s, l) => s + l.grossCents, 0);
    const itemDiscount = lines[d.id].reduce((s, l) => s + l.discountCents, 0);
    const p = {
      id: d.id, name: d.name, order: d.order, isPayer: d.id === payerId,
      lines: lines[d.id],
      grossFoodCents: gross, itemDiscountCents: itemDiscount,
      foodBeforeBillCents: foodBefore[d.id], billDiscountCents: billDisc[d.id], netFoodCents: netFood[d.id],
      taxCents: alloc.tax[d.id], serviceCents: alloc.service[d.id],
      includedTipCents: alloc.includedTip[d.id], extraTipCents: alloc.extraTip[d.id],
      adjustmentCents: sign * alloc.adjustment[d.id],
      totalCents: 0,
    };
    p.totalCents = p.netFoodCents + p.taxCents + p.serviceCents + p.includedTipCents + p.extraTipCents + p.adjustmentCents;
    return p;
  });

  const sum = people.reduce((s, p) => s + p.totalCents, 0);
  if (sum !== check.paidCents || people.some(p => p.totalCents < 0)) {
    return { ...base, ready: false, needsEqualCharges: false,
      blockers: [{ code: 'internal', message: `The amounts on this receipt don’t add up to a valid split (${formatMoney(sum)} vs ${formatMoney(check.paidCents)}). Check the items in receipt details.`, field: 'receiptTotalCents' }] };
  }
  const payer = /** @type {typeof people[number]} */ (people.find(p => p.isPayer));
  return {
    ...base, ready: true, blockers: [], needsEqualCharges: false, equalCharges,
    people, payer,
    finalPaidCents: check.paidCents,
    reimbursementCents: sum - payer.totalCents,
    others: people.filter(p => !p.isPayer),
  };
}
