import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt } from '../src/domain/receipt.js';
import { allocateBill, expandUnits } from '../src/domain/split.js';
import { billReducer, newBill, fromDraft, toDraft, appReducer, initialState } from '../src/state.js';
import { SAMPLE_A, SAMPLE_B, SAMPLE_C } from '../src/demo/receipts.js';

/** Build a bill from text and named diners through the reducer, like the UI does. */
function setup(text, names = ['Maya', 'Jordan', 'Sam']) {
  let b = billReducer(newBill(), { type: 'LOAD_RECEIPT', receipt: parseReceipt(text), kind: 'text', rawText: text });
  for (const n of names) b = billReducer(b, { type: 'ADD_DINER', name: n });
  const id = Object.fromEntries(b.diners.map(d => [d.name, d.id]));
  const run = (...actions) => { for (const a of actions) b = billReducer(b, a); return b; };
  const claim = (itemIdx, unit, ...who) => {
    const key = `${b.receipt.items[itemIdx].id}:${unit}`;
    for (const w of who) b = billReducer(b, { type: 'TOGGLE_CLAIM', key, dinerId: id[w] });
  };
  const pay = (cents, tip = false) => {
    run({ type: 'SET_PAID', cents });
    if (tip) run({ type: 'CLASSIFY_EXTRA_TIP' });
    run({ type: 'CONFIRM_PAID' });
  };
  return { get b() { return b; }, id, run, claim, pay };
}

const table = (res, field) => Object.fromEntries(res.people.map(p => [p.name, p[field]]));

function fixtureA() {
  const s = setup(SAMPLE_A);
  s.claim(0, 0, 'Maya'); s.claim(0, 1, 'Jordan');
  s.claim(1, 0, 'Sam');
  s.claim(2, 0, 'Maya', 'Jordan', 'Sam');
  s.claim(3, 0, 'Maya'); s.claim(3, 1, 'Sam');
  s.pay(3354, true);
  return s;
}

test('fixture A exact table, payer accounting', () => {
  const s = fixtureA();
  const res = allocateBill(s.b);
  assert.equal(res.ready, true, JSON.stringify(res.blockers));
  assert.deepEqual(table(res, 'grossFoodCents'), { Maya: 920, Jordan: 760, Sam: 1120 });
  assert.deepEqual(table(res, 'itemDiscountCents'), { Maya: 0, Jordan: 0, Sam: 0 });
  assert.deepEqual(table(res, 'billDiscountCents'), { Maya: 92, Jordan: 76, Sam: 112 });
  assert.deepEqual(table(res, 'netFoodCents'), { Maya: 828, Jordan: 684, Sam: 1008 });
  assert.deepEqual(table(res, 'taxCents'), { Maya: 68, Jordan: 57, Sam: 83 });
  assert.deepEqual(table(res, 'serviceCents'), { Maya: 42, Jordan: 34, Sam: 50 });
  assert.deepEqual(table(res, 'includedTipCents'), { Maya: 0, Jordan: 0, Sam: 0 });
  assert.deepEqual(table(res, 'extraTipCents'), { Maya: 164, Jordan: 136, Sam: 200 });
  assert.deepEqual(table(res, 'totalCents'), { Maya: 1102, Jordan: 911, Sam: 1341 });
  assert.equal(res.reimbursementCents, 2252);
  assert.equal(res.payer.name, 'Maya');
  assert.deepEqual(res.others.map(p => p.name), ['Jordan', 'Sam']);
  const fries = res.people.find(p => p.name === 'Jordan').lines.find(l => l.label.includes('FRIES'));
  assert.equal(fries.label, '1/3 of FRIES');
  assert.equal(fries.grossCents, 160);
});

test('changing payer keeps allocations; reimbursement follows payer', () => {
  const s = fixtureA();
  s.run({ type: 'SET_PAYER', id: s.id.Sam });
  const res = allocateBill(s.b);
  assert.deepEqual(table(res, 'totalCents'), { Maya: 1102, Jordan: 911, Sam: 1341 });
  assert.equal(res.reimbursementCents, 2013);
  assert.deepEqual(res.others.map(p => p.name), ['Maya', 'Jordan']);
});

test('extra tip must be explicitly classified, once', () => {
  const s = setup(SAMPLE_A);
  s.claim(0, 0, 'Maya'); s.claim(0, 1, 'Jordan'); s.claim(1, 0, 'Sam'); s.claim(2, 0, 'Maya', 'Jordan', 'Sam'); s.claim(3, 0, 'Maya'); s.claim(3, 1, 'Sam');
  s.run({ type: 'SET_PAID', cents: 3354 }, { type: 'CONFIRM_PAID' });
  let res = allocateBill(s.b);
  assert.equal(res.ready, false);
  assert.ok(res.blockers.some(x => x.code === 'paid-more'));
  s.run({ type: 'CLASSIFY_EXTRA_TIP' }, { type: 'CLASSIFY_EXTRA_TIP' }, { type: 'CONFIRM_PAID' });
  res = allocateBill(s.b);
  assert.equal(s.b.receipt.extraTipCents, 500);
  assert.equal(res.ready, true);
  assert.equal(res.finalPaidCents, 3354);
});

test('financial edits invalidate paid confirmation and remove readiness', () => {
  const s = fixtureA();
  s.run({ type: 'SET_CHARGE', field: 'taxCents', cents: 108 });
  let res = allocateBill(s.b);
  assert.equal(res.ready, false);
  assert.equal(s.b.receipt.paidConfirmed, false);
  assert.ok(res.blockers.some(x => x.code === 'mismatch'));
  assert.equal(res.people, undefined);
  s.run({ type: 'SET_CHARGE', field: 'taxCents', cents: 208 });
  assert.equal(allocateBill(s.b).ready, false); // still needs reconfirmation
  s.run({ type: 'CONFIRM_PAID' });
  assert.equal(allocateBill(s.b).ready, true);
  // Assignment/name edits do not clear confirmation.
  s.run({ type: 'RENAME_DINER', id: s.id.Jordan, name: 'Jordy' });
  assert.equal(s.b.receipt.paidConfirmed, true);
  assert.equal(allocateBill(s.b).others[0].name, 'Jordy');
});

test('fixture B exact table with item discount', () => {
  const s = setup(SAMPLE_B);
  s.claim(0, 0, 'Maya'); s.claim(0, 1, 'Jordan'); s.claim(1, 0, 'Sam');
  s.pay(3001, true);
  const res = allocateBill(s.b);
  assert.equal(res.ready, true, JSON.stringify(res.blockers));
  assert.equal(s.b.receipt.extraTipCents, 468);
  assert.deepEqual(table(res, 'grossFoodCents'), { Maya: 1000, Jordan: 1000, Sam: 1000 });
  assert.deepEqual(table(res, 'itemDiscountCents'), { Maya: 200, Jordan: 200, Sam: 0 });
  assert.deepEqual(table(res, 'billDiscountCents'), { Maya: 80, Jordan: 80, Sam: 100 });
  assert.deepEqual(table(res, 'netFoodCents'), { Maya: 720, Jordan: 720, Sam: 900 });
  assert.deepEqual(table(res, 'taxCents'), { Maya: 60, Jordan: 59, Sam: 74 });
  assert.deepEqual(table(res, 'extraTipCents'), { Maya: 144, Jordan: 144, Sam: 180 });
  assert.deepEqual(table(res, 'totalCents'), { Maya: 924, Jordan: 923, Sam: 1154 });
  assert.equal(res.reimbursementCents, 2077);
});

test('fixture B: one owner of both pizza units receives the entire item discount', () => {
  const s = setup(SAMPLE_B);
  s.claim(0, 0, 'Maya'); s.claim(0, 1, 'Maya'); s.claim(1, 0, 'Sam');
  s.pay(2533);
  const res = allocateBill(s.b);
  assert.deepEqual(table(res, 'itemDiscountCents'), { Maya: 400, Jordan: 0, Sam: 0 });
  assert.equal(res.people.find(p => p.name === 'Jordan').totalCents, 0);
});

test('fixture C penny conservation and novel edits', () => {
  const s = setup(SAMPLE_C);
  s.claim(0, 0, 'Maya', 'Jordan', 'Sam');
  s.pay(1001);
  const res = allocateBill(s.b);
  assert.deepEqual(table(res, 'totalCents'), { Maya: 334, Jordan: 334, Sam: 333 });
  assert.equal(res.reimbursementCents, 667);
  assert.equal(res.people[0].lines[0].label, '1/3 of SHARED PLATE');

  const c2 = setup(SAMPLE_C.replaceAll('10.01', '10.02'));
  c2.claim(0, 0, 'Maya', 'Jordan', 'Sam'); c2.pay(1002);
  assert.deepEqual(table(allocateBill(c2.b), 'totalCents'), { Maya: 334, Jordan: 334, Sam: 334 });

  const tapas = setup('TAPAS 7.01\nTOTAL 7.01', ['Maya', 'Jordan']);
  tapas.claim(0, 0, 'Maya', 'Jordan'); tapas.pay(701);
  assert.deepEqual(table(allocateBill(tapas.b), 'totalCents'), { Maya: 351, Jordan: 350 });
});

test('stable ties use creation order, not display order', () => {
  const s = setup(SAMPLE_C, ['Sam', 'Maya', 'Jordan']);
  s.claim(0, 0, 'Jordan', 'Maya', 'Sam');
  s.pay(1001);
  assert.deepEqual(table(allocateBill(s.b), 'totalCents'), { Sam: 334, Maya: 334, Jordan: 333 });
});

test('assignment variants: clearing, reassigning, only, share all, remove diner', () => {
  const s = setup(SAMPLE_A);
  const key = `${s.b.receipt.items[2].id}:0`;
  s.claim(2, 0, 'Maya', 'Jordan');
  assert.deepEqual(s.b.claims[key], [s.id.Maya, s.id.Jordan]);
  s.claim(2, 0, 'Maya'); // toggle off
  assert.deepEqual(s.b.claims[key], [s.id.Jordan]);
  s.run({ type: 'CLAIM_ONLY', key, dinerId: s.id.Sam });
  assert.deepEqual(s.b.claims[key], [s.id.Sam]);
  s.run({ type: 'SHARE_ALL', key });
  assert.deepEqual(s.b.claims[key], [s.id.Maya, s.id.Jordan, s.id.Sam]);
  s.run({ type: 'ADD_DINER', name: 'Alex' });
  assert.equal(s.b.claims[key].length, 3, 'new diners are not silently added to shared units');
  s.run({ type: 'REMOVE_DINER', id: s.id.Jordan });
  assert.deepEqual(s.b.claims[key], [s.id.Maya, s.id.Sam]);
  s.run({ type: 'CLEAR_CLAIM', key });
  assert.equal(s.b.claims[key], undefined);
  s.claim(1, 0, 'Sam');
  s.run({ type: 'REMOVE_DINER', id: s.id.Sam });
  assert.equal(s.b.claims[`${s.b.receipt.items[1].id}:0`], undefined, 'removed diner unit returns to unassigned');
  s.run({ type: 'REMOVE_DINER', id: s.id.Maya });
  assert.equal(s.b.payerId, null);
});

test('quantity edit invalidates only that line', () => {
  const s = setup(SAMPLE_A);
  s.claim(0, 0, 'Maya'); s.claim(0, 1, 'Jordan'); s.claim(1, 0, 'Sam');
  const sandwich = s.b.receipt.items[0].id;
  s.run({ type: 'UPDATE_ITEM', id: sandwich, patch: { quantity: 3 } });
  assert.equal(s.b.claims[`${sandwich}:0`], undefined);
  assert.equal(s.b.claims[`${sandwich}:1`], undefined);
  assert.deepEqual(s.b.claims[`${s.b.receipt.items[1].id}:0`], [s.id.Sam]);
  assert.match(s.b.notices[sandwich], /cleared/);
  assert.equal(expandUnits(s.b.receipt).filter(u => u.itemId === sandwich).map(u => u.grossCents).join(), '400,400,400');
});

test('zero-owner unit blocks final requests and shows provisional food only', () => {
  const s = setup(SAMPLE_A);
  s.claim(0, 0, 'Maya'); s.claim(0, 1, 'Jordan');
  s.pay(2854);
  const res = allocateBill(s.b);
  assert.equal(res.ready, false);
  assert.equal(res.claimedUnits, 2);
  assert.equal(res.units.length, 6);
  assert.equal(res.unclaimedFoodCents, 800 + 480 + 320);
  assert.deepEqual(res.provisional.map(p => p.foodCents), [600, 600, 0]);
  assert.equal(res.people, undefined);
});

test('final paid below receipt requires correction', () => {
  const s = setup(SAMPLE_C);
  s.claim(0, 0, 'Maya');
  s.pay(900);
  const res = allocateBill(s.b);
  assert.equal(res.ready, false);
  assert.ok(res.blockers.some(x => x.code === 'paid-less'));
});

test('printed tip variant: only the later increment is extra tip', () => {
  const s = setup('CAFE\nBURGER 10.00\nTIP 2.00\nTOTAL 12.00', ['Maya', 'Jordan']);
  s.claim(0, 0, 'Maya', 'Jordan');
  s.pay(1500, true);
  const res = allocateBill(s.b);
  assert.equal(s.b.receipt.extraTipCents, 300);
  assert.deepEqual(table(res, 'includedTipCents'), { Maya: 100, Jordan: 100 });
  assert.deepEqual(table(res, 'extraTipCents'), { Maya: 150, Jordan: 150 });
  assert.deepEqual(table(res, 'totalCents'), { Maya: 750, Jordan: 750 });
});

test('zero basis: all-zero bill and explicit equal-charge choice', () => {
  const zero = setup('FREEBIE 5.00\nBILL DISCOUNT -5.00\nTOTAL 0.00', ['Maya', 'Jordan']);
  zero.claim(0, 0, 'Maya'); zero.pay(0);
  const z = allocateBill(zero.b);
  assert.equal(z.ready, true);
  assert.deepEqual(table(z, 'totalCents'), { Maya: 0, Jordan: 0 });
  assert.equal(z.reimbursementCents, 0);

  const s = setup('FREEBIE 5.00\nBILL DISCOUNT -5.00\nTAX 0.41\nTOTAL 0.41', ['Maya', 'Jordan', 'Sam']);
  s.claim(0, 0, 'Maya'); s.pay(41);
  let res = allocateBill(s.b);
  assert.equal(res.ready, false);
  assert.equal(res.needsEqualCharges, true);
  s.run({ type: 'SET_CHARGE_BASIS', basis: 'equalConfirmed' });
  res = allocateBill(s.b);
  assert.equal(res.ready, true);
  assert.deepEqual(table(res, 'totalCents'), { Maya: 14, Jordan: 14, Sam: 13 });
});

test('a diner with no food receives zero under proportional allocation', () => {
  const s = setup(SAMPLE_A, ['Maya', 'Jordan', 'Sam', 'Alex']);
  s.claim(0, 0, 'Maya'); s.claim(0, 1, 'Jordan'); s.claim(1, 0, 'Sam'); s.claim(2, 0, 'Maya', 'Jordan', 'Sam'); s.claim(3, 0, 'Maya'); s.claim(3, 1, 'Sam');
  s.pay(3354, true);
  const res = allocateBill(s.b);
  assert.equal(res.people.find(p => p.name === 'Alex').totalCents, 0);
  assert.deepEqual(table(res, 'totalCents'), { Maya: 1102, Jordan: 911, Sam: 1341, Alex: 0 });
});

test('generated financially valid bills conserve every cent', () => {
  let seed = 99;
  const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let k = 0; k < 200; k++) {
    const nItems = 1 + rand(6);
    const lines = [];
    let food = 0;
    for (let i = 0; i < nItems; i++) {
      const q = 1 + rand(4), cents = 1 + rand(5000);
      food += cents;
      lines.push(`${q} ITEM${String.fromCharCode(65 + i)} ${(cents / 100).toFixed(2)}`);
    }
    const disc = rand(3) === 0 ? rand(food + 1) : 0;
    const tax = rand(900), svc = rand(3) === 0 ? rand(700) : 0;
    if (disc) lines.push(`BILL DISCOUNT -${(disc / 100).toFixed(2)}`);
    lines.push(`TAX ${(tax / 100).toFixed(2)}`);
    if (svc) lines.push(`SERVICE ${(svc / 100).toFixed(2)}`);
    const total = food - disc + tax + svc;
    lines.push(`TOTAL ${(total / 100).toFixed(2)}`);
    const names = ['A1', 'B2', 'C3', 'D4', 'E5'].slice(0, 1 + rand(5));
    const s = setup(lines.join('\n'), names);
    s.b.receipt.items.forEach((item, idx) => {
      for (let u = 0; u < item.quantity; u++) {
        const who = names.filter(() => rand(2) === 0);
        s.claim(idx, u, ...(who.length ? who : [names[rand(names.length)]]));
      }
    });
    const extra = rand(2) ? rand(2000) : 0;
    s.pay(total + extra, extra > 0);
    if (food - disc === 0 && tax + svc + extra > 0) s.run({ type: 'SET_CHARGE_BASIS', basis: 'equalConfirmed' });
    const res = allocateBill(s.b);
    assert.equal(res.ready, true, JSON.stringify(res.blockers));
    assert.equal(res.people.reduce((sum, p) => sum + p.totalCents, 0), total + extra);
    for (const p of res.people) for (const v of [p.totalCents, p.taxCents, p.serviceCents, p.extraTipCents, p.netFoodCents, p.itemDiscountCents]) assert.ok(Number.isSafeInteger(v) && v >= 0);
    assert.equal(res.reimbursementCents, total + extra - res.payer.totalCents);
  }
});

test('draft round-trip is sanitized and requires reconfirmation; corrupt data is rejected', () => {
  const s = fixtureA();
  const draft = JSON.parse(JSON.stringify(toDraft(s.b)));
  const text = JSON.stringify(draft);
  for (const secret of ['DEMO-101', 'DEMO-000', '10/24/2026', 'sourceLine', 'rawText', 'payment']) assert.ok(!text.includes(secret), secret);
  const back = fromDraft(draft);
  assert.ok(back);
  assert.equal(back.receipt.paidConfirmed, false);
  assert.equal(back.restoredDraft, true);
  assert.equal(allocateBill(back).ready, false);
  const confirmed = billReducer(back, { type: 'CONFIRM_PAID' });
  assert.deepEqual(allocateBill(confirmed).people.map(p => p.totalCents), [1102, 911, 1341]);
  for (const bad of [null, 1, 'x', {}, { schemaVersion: 2 }, { ...draft, diners: 'no' },
    { ...draft, claims: { 'i1:0': ['ghost'] } }, { ...draft, receipt: { ...draft.receipt, taxCents: 1.5 } },
    { ...draft, receipt: { ...draft.receipt, items: [{ ...draft.receipt.items[0], quantity: 99 }] } }]) {
    assert.equal(fromDraft(bad), null);
  }
});

test('demo and real bills stay separate', () => {
  let st = initialState();
  st = appReducer(st, { type: 'LOAD_RECEIPT', receipt: parseReceipt(SAMPLE_C), kind: 'text' });
  st = appReducer(st, { type: 'ADD_DINER', name: 'Riley' });
  st = appReducer(st, { type: 'ENTER_DEMO' });
  assert.deepEqual(st.demo.diners.map(d => d.name), ['Maya', 'Jordan', 'Sam']);
  assert.deepEqual(st.demo.claims, {});
  assert.equal(st.demo.receipt.paidConfirmed, false);
  st = appReducer(st, { type: 'ADD_DINER', name: 'Taylor' });
  st = appReducer(st, { type: 'RESET_DEMO' });
  assert.equal(st.demo.diners.length, 3);
  st = appReducer(st, { type: 'EXIT_DEMO' });
  assert.deepEqual(st.real.diners.map(d => d.name), ['Riley']);
  assert.equal(st.real.receipt.items[0].name, 'SHARED PLATE');
});
