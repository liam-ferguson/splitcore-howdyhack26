import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, validateReceipt, normalizeLines, repairOcrLine } from '../src/domain/receipt.js';
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
  assert.deepEqual(r.headerLines, ['Chick-fil-A']);
  const v = validateReceipt(r);
  assert.equal(v.expected, 2854);
  assert.equal(v.arithmeticMatches, true);
  assert.equal(v.subtotalBasis, 'net');
  assert.equal(v.total, 2854);
  assert.equal(v.adjustmentCents, 0);
  assert.equal(v.paidCents, 2854); // paid = receipt total until a tip is added
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

test('merchant detection skips boilerplate, addresses and phones', () => {
  assert.equal(parseReceipt('WELCOME TO\nDOMINO\'S PIZZA\n123 MAIN ST\nPIZZA 10.00\nTOTAL 10.00').merchant, "DOMINO'S PIZZA");
  assert.equal(parseReceipt('Welcome to Pizza Hut\nPIZZA 10.00\nTOTAL 10.00').merchant, 'Pizza Hut');
  assert.equal(parseReceipt('1500 UNIVERSITY DR\n(979) 555-1234\nCOLLEGE STATION, TX 77840\nTHE PIZZA SHACK\nPIZZA 10.00\nTOTAL 10.00').merchant, 'THE PIZZA SHACK');
  assert.equal(parseReceipt('CUSTOMER COPY\nGUEST CHECK\nPIZZA 10.00\nTOTAL 10.00').merchant, '');
  const r = parseReceipt('ee\nCORNER PIZZA CO\nPIZZA 10.00\nTOTAL 10.00\nOrder online: www.cornerpizza.com\nEmail: hi@dominos.com');
  assert.equal(r.merchant, 'CORNER PIZZA CO');
  assert.deepEqual(r.domains, ['cornerpizza.com', 'dominos.com']);
  assert.deepEqual(r.headerLines, ['ee', 'CORNER PIZZA CO']);
});

test('fees go to service & fees; distinct fee lines add up', () => {
  const r = parseReceipt('PIZZA PLACE\n1 LARGE PIZZA 15.00\nDELIVERY FEE 3.99\nSERVICE FEE 1.00\nTAX 1.24\nTOTAL 21.23');
  assert.equal(r.serviceCents, 499);
  assert.deepEqual(items(r), [['LARGE PIZZA', 1, 1500]]);
  assert.deepEqual(codes(r), []);
  // An item merely containing the word SERVICE is still an item.
  const item = parseReceipt('ROOM SERVICE BURGER 12.00\nTOTAL 12.00');
  assert.deepEqual(items(item), [['ROOM SERVICE BURGER', 1, 1200]]);
});

test('lines after the total and $0 promos never block', () => {
  const r = parseReceipt('CAFE\nBURGER 8.00\nREWARD FRIES 0.00\nTOTAL 8.00\nAMOUNT PAID 8.00\nVISA 8.00\nMYSTERY 2.00');
  assert.deepEqual(items(r), [['BURGER', 1, 800]]);
  assert.deepEqual(r.discounts, []);
  assert.deepEqual(codes(r), []);
  const after = r.issues.filter(i => i.code === 'unknown-line');
  assert.deepEqual(after.map(i => [i.line, i.severity]), [['MYSTERY 2.00', 'info']]);
  // Leading bullets and modifier markers are trimmed from names.
  assert.deepEqual(items(parseReceipt('+ EXTRA CHEESE 1.00\nTOTAL 1.00')), [['EXTRA CHEESE', 1, 100]]);
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

test('parser has no filename or mode parameter', () => {
  assert.equal(parseReceipt.length, 1);
});

test('OCR repairs inside prices: commas, stray spaces, letters for digits', () => {
  assert.equal(repairOcrLine('2 SANDWICH 12,00'), '2 SANDWICH 12.00');
  assert.equal(repairOcrLine('TAX 2;08'), 'TAX 2.08');
  assert.equal(repairOcrLine('FRIES 4. 80'), 'FRIES 4.80');
  assert.equal(repairOcrLine('NUGGETS 8.O0'), 'NUGGETS 8.00');
  assert.equal(repairOcrLine('BURGER l2.00'), 'BURGER 12.00');
  assert.equal(repairOcrLine('SHAKE 1S.50 T'), 'SHAKE 15.50 T');
  // Never touched: thousands separators, dates and times, item names.
  assert.equal(repairOcrLine('PLATTER 1,234.56'), 'PLATTER 1,234.56');
  assert.equal(repairOcrLine('DATE 10/24/2026 TIME 18,30'), 'DATE 10/24/2026 TIME 18,30');
  assert.equal(repairOcrLine('BOSS BURGER 8.00'), 'BOSS BURGER 8.00');
  const r = parseReceipt(['CAFE', '2 SANDWICH 12,00', '1 FRIES 4. 80', 'TAX l.08', 'TOTAL 17,88'].join('\n'));
  assert.deepEqual(items(r), [['SANDWICH', 2, 1200], ['FRIES', 1, 480]]);
  assert.equal(r.taxCents, 108);
  assert.equal(r.receiptTotalCents, 1788);
  assert.equal(validateReceipt(r).arithmeticMatches, true);
});

test('nothing on a readable receipt blocks: review notes are informational', () => {
  // @ price mismatch: the line total is used, with a note.
  const at = parseReceipt('2 SANDWICH @ 6.00 13.00\nTOTAL 13.00');
  assert.equal(at.items[0].needsReview, true);
  assert.deepEqual(codes(at), []);
  assert.ok(validateReceipt(at).issues.some(i => i.code === 'item-review' && i.severity === 'info'));
  // Missing total: the items and charges are used as the total.
  const noTotal = parseReceipt('BURGER 8.00\nSUBTOTAL 8.00\nTAX 0.66');
  assert.equal(noTotal.receiptTotalCents, null);
  assert.equal(noTotal.printedSubtotalCents, 800); // SUBTOTAL is never read as TOTAL
  assert.deepEqual(codes(noTotal), []);
  assert.equal(validateReceipt(noTotal).total, 866);
  // Subtotal that matches nothing is just evidence.
  assert.equal(validateReceipt(parseReceipt('BURGER 10.00\nSUBTOTAL 10.00\nBILL DISCOUNT -1.00\nTOTAL 9.00')).subtotalBasis, 'gross');
  const bad = parseReceipt('BURGER 10.00\nSUBTOTAL 11.00\nTOTAL 10.00');
  assert.equal(validateReceipt(bad).subtotalBasis, 'unresolved');
  assert.deepEqual(codes(bad), []);
});

test('printed total wins; a mismatch becomes a visible shared adjustment', () => {
  const r = parseReceipt(SAMPLE_A);
  r.taxCents = 108; // e.g. OCR misread
  const v = validateReceipt(r);
  assert.deepEqual(v.blocking, []);
  assert.equal(v.total, 2854);
  assert.equal(v.adjustmentCents, 100);
  assert.match(v.issues.find(i => i.code === 'mismatch').message, /\$1\.00 below the printed total/);
  const u = parseReceipt('CAFE\nBURGER 8.00\nSPECIAL -1.00\nFRIES 4.8\nSHAKE 500\nMYSTERY FEE 2.00\nTOTAL 20.00');
  assert.deepEqual(u.issues.filter(i => i.code === 'unknown-line').map(i => i.line), ['FRIES 4.8', 'SHAKE 500']);
  const uv = validateReceipt(u);
  assert.deepEqual(uv.blocking, []);
  assert.equal(uv.expected, 900);
  assert.equal(uv.adjustmentCents, 1100);
  const multi = parseReceipt('2 SANDWICH 12.00 1 NUGGETS 8.00\nTOTAL 20.00');
  assert.equal(multi.items.length, 0);
  assert.deepEqual(codes(multi), ['no-items']);
});

test('repeated totals and tax lines are resolved automatically', () => {
  const same = parseReceipt('BURGER 10.00\nTOTAL 10.00\nTOTAL 10.00');
  assert.equal(same.receiptTotalCents, 1000);
  const conflict = parseReceipt('BURGER 10.00\nTOTAL 12.00\nGRAND TOTAL 10.00');
  assert.equal(conflict.receiptTotalCents, 1000, 'picks the total that makes the receipt add up');
  const issue = conflict.issues.find(i => i.code === 'duplicate-field');
  assert.equal(issue.severity, 'info');
  assert.deepEqual(issue.candidates.map(c => c.cents), [1200, 1000]);
  assert.deepEqual(codes(conflict), []);
  const twoTax = parseReceipt('BURGER 10.00\nSTATE TAX 0.50\nCITY TAX 0.25\nTOTAL 10.75');
  assert.equal(twoTax.taxCents, 75);
  assert.ok(twoTax.issues.some(i => i.code === 'summed-lines' && i.severity === 'info'));
  const sameTax = parseReceipt('BURGER 10.00\nTAX 0.50\nTAX 0.25\nTOTAL 10.75');
  assert.equal(sameTax.taxCents, 75, 'the reading that adds up (both lines) is chosen');
  const noFit = parseReceipt('BURGER 10.00\nTAX 0.50\nTAX 0.25\nTOTAL 99.00');
  assert.equal(noFit.taxCents, 50, 'falls back to the first reading');
});

test('discounts: explicit scopes kept, unclear ones default to the whole bill', () => {
  const generic = parseReceipt('PIZZA 10.00\nCOUPON -2.00\nTOTAL 8.00');
  assert.deepEqual(generic.discounts.map(d => [d.scope, d.cents, !!d.autoScope]), [['bill', 200, true]]);
  assert.ok(generic.issues.some(i => i.code === 'auto-scope'));
  assert.deepEqual(codes(generic), []);
  assert.equal(validateReceipt(generic).arithmeticMatches, true);
  const promo = parseReceipt('PIZZA 10.00\nPROMO 2.00-\nTOTAL 8.00');
  assert.deepEqual(promo.discounts.map(d => [d.scope, d.cents]), [['bill', 200]]);
  const paren = parseReceipt('PIZZA 10.00\nRECEIPT DISCOUNT (2.00)\nTOTAL 8.00');
  assert.deepEqual(paren.discounts.map(d => [d.scope, d.cents, !!d.autoScope]), [['bill', 200, false]]);
  const ambiguous = parseReceipt('PIZZA 10.00\nPIZZA 12.00\nPIZZA DISCOUNT -2.00\nTOTAL 20.00');
  assert.equal(ambiguous.discounts[0].scope, 'bill');
  const tooBig = parseReceipt(SAMPLE_B.replace(/PIZZA DISCOUNT\s+-4\.00/, 'PIZZA DISCOUNT -21.00'));
  assert.ok(codes(tooBig).includes('discount-exceeds-item'));
  const overFood = parseReceipt('PIZZA 10.00\nBILL DISCOUNT -11.00\nTOTAL 0.00');
  assert.ok(codes(overFood).includes('discount-exceeds-food'));
  // A deleted target falls back to the whole bill with a note (never silently dropped).
  const b = parseReceipt(SAMPLE_B);
  b.items = b.items.filter(i => i.id !== 'i1');
  const v = validateReceipt(b);
  assert.deepEqual(v.blocking, []);
  assert.equal(v.B, 660);
  assert.ok(v.issues.some(i => i.code === 'discount-target' && i.severity === 'info'));
});

test('printed TIP is included tip; paid = total + tip you added', () => {
  const r = parseReceipt('CAFE\nBURGER 10.00\nTIP 2.00\nTOTAL 12.00');
  assert.equal(r.includedTipCents, 200);
  assert.equal(validateReceipt(r).arithmeticMatches, true);
  assert.equal(validateReceipt(r).paidCents, 1200);
  r.extraTipCents = 300;
  assert.equal(validateReceipt(r).paidCents, 1500);
});
