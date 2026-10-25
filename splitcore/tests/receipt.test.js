import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, validateReceipt, normalizeLines } from '../src/domain/receipt.js';
import { SAMPLE_A, SAMPLE_B, SAMPLE_C } from '../src/demo/receipts.js';

const items = r => r.items.map(i => [i.name, i.quantity, i.grossCents]);
const codes = r => validateReceipt(r).blocking.map(i => i.code);

test('fixture A fields', () => {
  const r = parseReceipt(SAMPLE_A);
  assert.equal(r.merchant, 'Chick-fil-A');
  assert.equal(r.dateText, '10/24/2026');
  assert.equal(r.timeText, '18:30');
  assert.equal(r.storeNumber, 'DEMO-000');
  assert.equal(r.orderNumber, 'DEMO-101');
  assert.equal(r.sampleDisclaimer, true);
  assert.deepEqual(items(r), [['SANDWICH', 2, 1200], ['NUGGETS', 1, 800], ['FRIES', 1, 480], ['DRINK', 2, 320]]);
  assert.deepEqual(r.discounts.map(d => [d.scope, d.cents]), [['bill', 280]]);
  assert.equal(r.printedSubtotalCents, 2520);
  assert.equal(r.taxCents, 208);
  assert.equal(r.serviceCents, 126);
  assert.equal(r.includedTipCents, 0);
  assert.equal(r.receiptTotalCents, 2854);
  assert.equal(r.totalSource, 'ocr');
  assert.deepEqual(r.issues, []);
  const v = validateReceipt(r);
  assert.equal(v.expected, 2854);
  assert.equal(v.arithmeticMatches, true);
  assert.equal(v.subtotalBasis, 'net');
  assert.equal(v.paid.state, 'missing');
});

test('fixture B: exact unique item discount target', () => {
  const r = parseReceipt(SAMPLE_B);
  assert.equal(r.merchant, 'SPLITCORE CAFE');
  assert.deepEqual(items(r), [['PIZZA', 2, 2000], ['SALAD', 1, 1000]]);
  assert.deepEqual(r.discounts.map(d => [d.scope, d.itemId, d.cents]), [['item', 'i1', 400], ['bill', null, 260]]);
  assert.equal(r.taxCents, 193);
  assert.equal(r.serviceCents, 0);
  assert.equal(r.listed.service, false);
  assert.equal(r.receiptTotalCents, 2533);
  const v = validateReceipt(r);
  assert.equal(v.arithmeticMatches, true);
  assert.equal(v.subtotalBasis, 'net');
  assert.deepEqual(r.issues, []);
});

test('fixture C and novel edits are data-driven', () => {
  const c = parseReceipt(SAMPLE_C);
  assert.equal(c.merchant, 'PENNY DINER');
  assert.deepEqual(items(c), [['SHARED PLATE', 1, 1001]]);
  assert.equal(c.receiptTotalCents, 1001);
  assert.equal(c.listed.tax, false);
  const c2 = parseReceipt(SAMPLE_C.replaceAll('10.01', '10.02'));
  assert.deepEqual(items(c2), [['SHARED PLATE', 1, 1002]]);
  assert.equal(c2.receiptTotalCents, 1002);
  const tapas = parseReceipt('TAPAS 7.01\nTOTAL 7.01');
  assert.deepEqual(items(tapas), [['TAPAS', 1, 701]]);
  assert.equal(tapas.receiptTotalCents, 701);
  assert.equal(validateReceipt(tapas).arithmeticMatches, true);
});

test('CRLF, NBSP, unicode minus and separators normalize', () => {
  const text = 'CAFE\r\n2 SANDWICH  12.00\r\n----------\r\nBILL DISCOUNT −2.00\r\nTOTAL 10.00\r\n';
  assert.deepEqual(normalizeLines(text), ['CAFE', '2 SANDWICH 12.00', 'BILL DISCOUNT -2.00', 'TOTAL 10.00']);
  const r = parseReceipt(text);
  assert.deepEqual(items(r), [['SANDWICH', 2, 1200]]);
  assert.deepEqual(r.discounts.map(d => [d.scope, d.cents]), [['bill', 200]]);
  assert.equal(validateReceipt(r).arithmeticMatches, true);
});

test('supported quantity forms', () => {
  const r = parseReceipt('X\nBURGER 8.00\n2 SANDWICH 12.00\n2 x DRINK 3.20\nDRINK x2 3.20\n2 SANDWICH @ 6.00 12.00\nTOTAL 38.40');
  assert.deepEqual(items(r), [['BURGER', 1, 800], ['SANDWICH', 2, 1200], ['DRINK', 2, 320], ['DRINK', 2, 320], ['SANDWICH', 2, 1200]]);
  assert.equal(r.items[4].unitPriceCents, 600);
  assert.equal(r.items[4].needsReview, false);
  assert.deepEqual(codes(r), []);
});

test('quantity × unit price mismatch creates a review issue', () => {
  const r = parseReceipt('2 SANDWICH @ 6.00 13.00\nTOTAL 13.00');
  assert.equal(r.items[0].needsReview, true);
  assert.ok(codes(r).includes('item-review'));
});

test('SUBTOTAL is never read as TOTAL; missing total is blocking', () => {
  const r = parseReceipt('BURGER 8.00\nSUBTOTAL 8.00');
  assert.equal(r.printedSubtotalCents, 800);
  assert.equal(r.receiptTotalCents, null);
  assert.equal(r.totalSource, 'missing');
  assert.ok(codes(r).includes('missing-total'));
});

test('gross and net subtotal interpretations', () => {
  const gross = parseReceipt('BURGER 10.00\nBILL DISCOUNT -1.00\nSUBTOTAL 10.00\nTOTAL 9.00');
  assert.equal(validateReceipt(gross).subtotalBasis, 'gross');
  const net = parseReceipt('BURGER 10.00\nBILL DISCOUNT -1.00\nSUBTOTAL 9.00\nTOTAL 9.00');
  assert.equal(validateReceipt(net).subtotalBasis, 'net');
  const bad = parseReceipt('BURGER 10.00\nSUBTOTAL 11.00\nTOTAL 10.00');
  assert.equal(validateReceipt(bad).subtotalBasis, 'unresolved');
  assert.ok(codes(bad).includes('subtotal'));
  const none = parseReceipt('BURGER 10.00\nTOTAL 10.00');
  assert.equal(validateReceipt(none).subtotalBasis, 'none');
  assert.deepEqual(codes(none), []);
});

test('duplicate and conflicting totals', () => {
  const same = parseReceipt('BURGER 10.00\nTOTAL 10.00\nTOTAL 10.00');
  assert.equal(same.receiptTotalCents, 1000);
  assert.deepEqual(codes(same), []);
  const conflict = parseReceipt('BURGER 10.00\nTOTAL 10.00\nGRAND TOTAL 12.00');
  const issue = conflict.issues.find(i => i.code === 'duplicate-field');
  assert.equal(issue?.field, 'receiptTotalCents');
  assert.deepEqual(issue?.candidates?.map(c => c.cents), [1000, 1200]);
  assert.ok(codes(conflict).includes('duplicate-field'));
  const twoTax = parseReceipt('BURGER 10.00\nSTATE TAX 0.50\nCITY TAX 0.25\nTOTAL 10.75');
  const t = twoTax.issues.find(i => i.field === 'taxCents');
  assert.deepEqual(t?.candidates?.map(c => c.cents), [50, 25, 75]);
});

test('excluded lines: metadata, tender, change, card, tax rate, suggested tips', () => {
  const text = [
    'CAFE', 'DATE 10/24/2026 TIME 7:15 PM', 'ORDER # 4471', 'CHECK 88', 'TABLE 12', 'SERVER ALEX',
    'BURGER 8.00', 'BURGER 8.00', 'TAX RATE 8.25%', 'TAX 1.32', 'TOTAL 17.32',
    'CASH 20.00', 'CHANGE 2.68', 'VISA 17.32', 'AUTH CODE 123456',
    'SUGGESTED TIP 18% 3.12', '20% TIP 3.46', 'TIP ______',
  ].join('\n');
  const r = parseReceipt(text);
  assert.equal(r.orderNumber, '4471');
  assert.equal(r.timeText, '7:15 PM');
  assert.deepEqual(items(r), [['BURGER', 1, 800], ['BURGER', 1, 800]]); // duplicate lines stay distinct purchases
  assert.equal(r.taxCents, 132);
  assert.equal(r.includedTipCents, 0);
  assert.equal(r.receiptTotalCents, 1732);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(codes(r), []);
});

test('uncertain inputs become review issues without balancing charges', () => {
  const r = parseReceipt('CAFE\nBURGER 8.00\nSPECIAL -1.00\nFRIES 4.8\nSHAKE 500\nMYSTERY FEE 2.00\nTOTAL 20.00');
  assert.deepEqual(r.discounts.map(d => d.scope), ['unresolved']);
  const unknown = r.issues.filter(i => i.code === 'unknown-line').map(i => i.line);
  assert.deepEqual(unknown, ['FRIES 4.8', 'SHAKE 500']);
  // MYSTERY FEE is a priced line with letters, so it is a reviewable item, not a charge.
  assert.deepEqual(items(r), [['BURGER', 1, 800], ['MYSTERY FEE', 1, 200]]);
  const v = validateReceipt(r);
  assert.ok(v.blocking.some(i => i.code === 'discount-scope'));
  assert.ok(v.blocking.some(i => i.code === 'mismatch'));
  assert.equal(v.expected, 900);
  const multi = parseReceipt('2 SANDWICH 12.00 1 NUGGETS 8.00\nTOTAL 20.00');
  assert.equal(multi.items.length, 0);
  assert.equal(multi.issues[0].code, 'unknown-line');
  const decimal = parseReceipt('CAFE\nBURGER 8.00\nTOTAL 2854');
  assert.equal(decimal.receiptTotalCents, null);
  assert.ok(decimal.issues.some(i => i.code === 'unknown-line' && i.line === 'TOTAL 2854'));
});

test('discount scope rules', () => {
  const generic = parseReceipt('PIZZA 10.00\nCOUPON -2.00\nTOTAL 8.00');
  assert.equal(generic.discounts[0].scope, 'unresolved');
  const promo = parseReceipt('PIZZA 10.00\nPROMO 2.00-\nTOTAL 8.00');
  assert.deepEqual(promo.discounts.map(d => [d.scope, d.cents]), [['unresolved', 200]]);
  const paren = parseReceipt('PIZZA 10.00\nRECEIPT DISCOUNT (2.00)\nTOTAL 8.00');
  assert.deepEqual(paren.discounts.map(d => [d.scope, d.cents]), [['bill', 200]]);
  const ambiguous = parseReceipt('PIZZA 10.00\nPIZZA 12.00\nPIZZA DISCOUNT -2.00\nTOTAL 20.00');
  assert.equal(ambiguous.discounts[0].scope, 'unresolved');
  const tooBig = parseReceipt(SAMPLE_B.replace(/PIZZA DISCOUNT\s+-4\.00/, 'PIZZA DISCOUNT -21.00'));
  assert.ok(codes(tooBig).includes('discount-exceeds-item'));
  const overFood = parseReceipt('PIZZA 10.00\nBILL DISCOUNT -11.00\nTOTAL 0.00');
  assert.ok(codes(overFood).includes('discount-exceeds-food'));
  // Deleted target stays a blocking scope problem; it never becomes bill-wide.
  const b = parseReceipt(SAMPLE_B);
  b.items = b.items.filter(i => i.id !== 'i1');
  const v = validateReceipt(b);
  assert.ok(v.blocking.some(i => i.code === 'discount-target'));
  assert.equal(v.B, 260);
});

test('printed TIP is included tip; paid states', () => {
  const r = parseReceipt('CAFE\nBURGER 10.00\nTIP 2.00\nTOTAL 12.00');
  assert.equal(r.includedTipCents, 200);
  assert.equal(validateReceipt(r).arithmeticMatches, true);
  r.finalPaidCents = 1500;
  assert.deepEqual(validateReceipt(r).paid, { state: 'more', delta: 300 });
  r.extraTipCents = 300;
  assert.equal(validateReceipt(r).paid.state, 'unconfirmed');
  r.paidConfirmed = true;
  assert.equal(validateReceipt(r).paid.state, 'ok');
  r.finalPaidCents = 1400;
  assert.deepEqual(validateReceipt(r).paid, { state: 'reclassify', delta: 200 });
  r.extraTipCents = 0;
  r.finalPaidCents = 1100;
  assert.deepEqual(validateReceipt(r).paid, { state: 'less', delta: 100 });
});

test('manual total provenance and tax edit discrepancy', () => {
  const r = parseReceipt(SAMPLE_A);
  r.taxCents = 108;
  const v = validateReceipt(r);
  const mismatch = v.blocking.find(i => i.code === 'mismatch');
  assert.equal(mismatch?.message, 'Items and charges are $1.00 below the receipt total. Review the highlighted lines.');
  r.taxCents = 208;
  assert.equal(validateReceipt(r).arithmeticMatches, true);
});

test('parser has no filename or mode parameter', () => {
  assert.equal(parseReceipt.length, 1);
});
