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
  const check = validateReceipt(receipt);
  const units = expandUnits(receipt);

  /** @type {Record<string, {key: string, label: string, grossCents: number, discountCents: number, netCents: number, owners: number}[]>} */
  const lines = Object.fromEntries(diners.map(d => [d.id, []]));
  const unclaimed = [];
  for (const u of units) {
    const owners = ownersOf(claims, u.key, dinerOrder);
    if (!owners.length) { unclaimed.push(u); continue; }
    const w = owners.map(id => ({ id, weight: 1, order: /** @type {number} */ (dinerOrder.get(id)) }));
    const g = apportion(u.grossCents, w);
    const n = apportion(u.netCents, w);
    for (const id of owners) {
      lines[id].push({ key: u.key, label: shareLabel(u, owners.length), grossCents: g[id], discountCents: g[id] - n[id], netCents: n[id], owners: owners.length });
    }
  }

  const provisional = diners.map(d => ({
    id: d.id, name: d.name,
    foodCents: lines[d.id].reduce((s, l) => s + l.grossCents, 0),
  }));
  const unclaimedFoodCents = unclaimed.reduce((s, u) => s + u.grossCents, 0);

  /** @type {{code: string, message: string, field?: string}[]} */
  const blockers = check.blocking.map(i => ({ code: i.code, message: i.message, field: i.field }));
  if (!diners.length) blockers.push({ code: 'no-diners', message: 'Add the people at the table.', field: 'diners' });
  else if (!payerId || !dinerOrder.has(payerId)) blockers.push({ code: 'no-payer', message: 'Choose who paid the bill.', field: 'payer' });
  if (unclaimed.length) {
    blockers.push({ code: 'unclaimed', message: `${unclaimed.length} ${unclaimed.length === 1 ? 'unit still needs' : 'units still need'} an owner.`, field: `unit:${unclaimed[0].key}` });
  }
  const paidMessages = {
    missing: 'Enter the final amount you paid.',
    more: `You paid ${formatMoney(check.paid.delta)} more than the receipt total. Mark it as tip or correct the receipt.`,
    reclassify: 'The paid amount changed. Update the extra tip or correct the paid amount.',
    less: `The paid amount is ${formatMoney(check.paid.delta)} below the receipt total. Check the total or add a missing discount.`,
    unconfirmed: 'Confirm the final amount you paid.',
  };
  if (check.paid.state in paidMessages) blockers.push({ code: `paid-${check.paid.state}`, message: paidMessages[check.paid.state], field: 'paid' });

  const base = { check, units, unclaimed, unclaimedFoodCents, provisional, claimedUnits: units.length - unclaimed.length };
  if (blockers.length) return { ...base, ready: false, blockers, needsEqualCharges: false };

  // Step 4: bill discounts proportional to food after item discounts.
  const foodBefore = Object.fromEntries(diners.map(d => [d.id, lines[d.id].reduce((s, l) => s + l.netCents, 0)]));
  const B = check.B;
  const billDisc = apportion(B, diners.map(d => ({ id: d.id, weight: foodBefore[d.id], order: d.order })));
  const netFood = Object.fromEntries(diners.map(d => [d.id, foodBefore[d.id] - billDisc[d.id]]));

  // Step 5: each charge bucket independently, weights frozen at net food.
  const buckets = { tax: receipt.taxCents, service: receipt.serviceCents, includedTip: receipt.includedTipCents, extraTip: receipt.extraTipCents };
  const charges = Object.values(buckets).reduce((s, c) => s + c, 0);
  const foodSum = diners.reduce((s, d) => s + netFood[d.id], 0);
  let equalCharges = false;
  if (foodSum === 0 && charges > 0) {
    if (receipt.chargeBasis !== 'equalConfirmed') {
      return { ...base, ready: false, needsEqualCharges: true,
        blockers: [{ code: 'zero-basis', message: 'Food after discounts is zero, so charges cannot be shared by food. Split remaining charges equally?', field: 'chargeBasis' }] };
    }
    equalCharges = true;
  }
  const weights = diners.map(d => ({ id: d.id, weight: equalCharges ? 1 : netFood[d.id], order: d.order }));
  const alloc = Object.fromEntries(Object.entries(buckets).map(([k, total]) => [k, apportion(total, weights)]));

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
      totalCents: 0,
    };
    p.totalCents = p.netFoodCents + p.taxCents + p.serviceCents + p.includedTipCents + p.extraTipCents;
    return p;
  });

  const sum = people.reduce((s, p) => s + p.totalCents, 0);
  if (sum !== receipt.finalPaidCents) {
    return { ...base, ready: false, needsEqualCharges: false,
      blockers: [{ code: 'internal', message: `Internal check failed: shares sum to ${formatMoney(sum)}, not the paid amount.` }] };
  }
  const payer = /** @type {typeof people[number]} */ (people.find(p => p.isPayer));
  return {
    ...base, ready: true, blockers: [], needsEqualCharges: false, equalCharges,
    people, payer,
    finalPaidCents: /** @type {number} */ (receipt.finalPaidCents),
    reimbursementCents: sum - payer.totalCents,
    others: people.filter(p => !p.isPayer),
  };
}
