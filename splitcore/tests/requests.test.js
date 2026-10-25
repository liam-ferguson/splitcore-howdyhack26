import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, checkPayment, demoPayload, normalizePaypal, paypalLink, validateProviderUrl, venmoLink, cashAppLink } from '../src/domain/requests.js';
import { matchMerchant, receiptDetails, DIRECTORY, findRewards, searchDirectory, VERIFIED_ON } from '../src/domain/rewards.js';
import { parseReceipt } from '../src/domain/receipt.js';
import { SAMPLE_A } from '../src/demo/receipts.js';

const jordan = {
  name: 'Jordan', totalCents: 911, netFoodCents: 684, taxCents: 57, serviceCents: 34, includedTipCents: 0, extraTipCents: 136,
  lines: [{ label: 'SANDWICH 2 of 2', grossCents: 600 }, { label: '1/3 of FRIES', grossCents: 160 }],
};

test('PayPal.Me amount format', () => {
  assert.equal(paypalLink('SplitCoreExample', 911), 'https://paypal.me/SplitCoreExample/9.11USD');
  assert.equal(paypalLink('SplitCoreExample', 1), 'https://paypal.me/SplitCoreExample/0.01USD');
  assert.equal(paypalLink('SplitCoreExample', 1000), 'https://paypal.me/SplitCoreExample/10.00USD');
  assert.equal(paypalLink('SplitCoreExample', 0), null);
  assert.throws(() => paypalLink('bad name', 100));
});

test('PayPal handle normalization is syntax-only and strips pasted amounts for review', () => {
  assert.deepEqual(normalizePaypal('SplitCoreExample'), { ok: true, handle: 'SplitCoreExample', base: 'https://paypal.me/SplitCoreExample', stripped: false });
  const pasted = normalizePaypal('https://paypal.me/SplitCoreExample/25USD?locale=x');
  assert.equal(pasted.ok, true);
  assert.equal(pasted.base, 'https://paypal.me/SplitCoreExample');
  assert.equal(pasted.stripped, true);
  for (const bad of ['', 'a'.repeat(21), 'has space', 'semi;colon', 'http://paypal.me/abc', 'https://paypal.me.evil.com/abc', 'https://evil.com/paypal.me/abc', 'https://user@paypal.me/abc']) {
    assert.equal(normalizePaypal(bad).ok, false, bad);
  }
});

test('provider URL validation: allowlisted HTTPS hosts only, unchanged when valid', () => {
  const ok = 'https://account.venmo.com/u/Example-User';
  assert.deepEqual(validateProviderUrl(ok, 'venmo'), { ok: true, url: ok, host: 'account.venmo.com' });
  assert.equal(validateProviderUrl('  https://cash.app/$Example  ', 'cashapp').url, 'https://cash.app/$Example');
  const rejects = [
    ['http://venmo.com/u/x', 'venmo'], ['https://user:pw@venmo.com/u/x', 'venmo'], ['https://venmo.com:8443/u/x', 'venmo'],
    ['https://venmo.com.evil.com/u/x', 'venmo'], ['https://evilvenmo.com/u/x', 'venmo'], ['javascript:alert(1)', 'venmo'],
    ['data:text/html,hi', 'cashapp'], ['https://cash.app/%E0%A4%A', 'cashapp'], ['https://cash.app.example/$x', 'cashapp'],
    ['https://venmo.com/u/x', 'cashapp'], ['https://cash.app/$x y', 'cashapp'], ['not a url', 'venmo'],
  ];
  for (const [url, p] of rejects) assert.equal(validateProviderUrl(url, /** @type {any} */ (p)).ok, false, url);
});

test('Venmo links prefill amount and note; Cash App uses the documented $cashtag link', () => {
  assert.equal(venmoLink('@maya-example', 911, 'Chick-fil-A split (SplitCore)'),
    'https://venmo.com/maya-example?txn=pay&amount=9.11&note=Chick-fil-A%20split%20%28SplitCore%29');
  assert.equal(venmoLink('maya-example', 0, 'x'), null);
  assert.throws(() => venmoLink('bad user!', 100, 'x'));
  assert.equal(cashAppLink('$MayaEx'), 'https://cash.app/$MayaEx');
  assert.equal(cashAppLink('MayaEx'), 'https://cash.app/$MayaEx');
  assert.throws(() => cashAppLink('12345')); // cashtags need a letter
  const v = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'Cafe', demo: false, payment: { method: 'venmo', handle: 'maya-example' } });
  assert.equal(v.link?.href, 'https://venmo.com/maya-example?txn=pay&amount=9.11&note=Cafe%20split%20%28SplitCore%29');
  assert.equal(v.link?.amountIncluded, true);
  assert.equal(v.qrPayload, v.link?.href, 'the QR is the payment link');
  assert.match(v.message, /Please send \$9\.11 to Maya on Venmo: https:\/\/venmo\.com\/maya-example\?txn=pay/);
  const c = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'Cafe', demo: false, payment: { method: 'cashapp', handle: '$MayaEx' } });
  assert.equal(c.link?.href, 'https://cash.app/$MayaEx');
  assert.equal(c.link?.amountIncluded, false);
  assert.equal(c.copyHandle, '$MayaEx');
  assert.equal(c.qrLabel, 'Scan to open $MayaEx on Cash App, then enter $9.11.');
  const bad = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'Cafe', demo: false, payment: { method: 'venmo', handle: 'x' } });
  assert.equal(bad.link, null);
  assert.ok(bad.paymentError);
  assert.equal(checkPayment({ method: 'cashapp', handle: '$ok1' }).handle, '$ok1');
});

test('real PayPal request and reminder text', () => {
  const r = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'Chick-fil-A', demo: false, payment: { method: 'paypal', handle: 'SplitCoreExample' } });
  assert.equal(r.link?.href, 'https://paypal.me/SplitCoreExample/9.11USD');
  assert.equal(r.link?.label, 'Pay $9.11 with PayPal');
  assert.equal(r.qrPayload, 'https://paypal.me/SplitCoreExample/9.11USD');
  assert.equal(r.message, [
    'Hey Jordan! Your share at Chick-fil-A is $9.11. SANDWICH 2 of 2 $6.00, 1/3 of FRIES $1.60.',
    'Food after discounts $6.84; tax $0.57; service $0.34; extra tip $1.36.',
    'Please send $9.11 to Maya on PayPal: https://paypal.me/SplitCoreExample/9.11USD. Thanks!',
  ].join('\n'));
  const none = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'Cafe', demo: false, payment: { method: 'none', handle: '' } });
  assert.equal(none.link, null);
  assert.equal(none.qrPayload, null);
  assert.match(none.message, /Please send \$9\.11 to Maya\. Thanks!$/);
});

test('demo: text QR without a handle; your own handle gives a real link', () => {
  const plain = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'Chick-fil-A', demo: true, payment: { method: 'none', handle: '' } });
  assert.equal(plain.link, null);
  assert.equal(plain.qrPayload, 'SPLITCORE DEMO | No payment | Jordan | USD 9.11 | Food 6.84 + tax 0.57 + service 0.34 + extra tip 1.36 | Sample only');
  assert.equal(plain.qrLabel, 'Demo QR — contains a sample breakdown, not a payment link.');
  assert.ok(plain.message.startsWith('DEMO — sample receipt.\n'));
  const own = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'Chick-fil-A', demo: true, payment: { method: 'paypal', handle: 'SplitCoreExample' } });
  assert.equal(own.link?.href, 'https://paypal.me/SplitCoreExample/9.11USD');
});

test('demo payload format and zero balance', () => {
  assert.equal(demoPayload(jordan), 'SPLITCORE DEMO | No payment | Jordan | USD 9.11 | Food 6.84 + tax 0.57 + service 0.34 + extra tip 1.36 | Sample only');
  const zero = { ...jordan, totalCents: 0, netFoodCents: 0, taxCents: 0, serviceCents: 0, extraTipCents: 0, lines: [] };
  const r = buildRequest({ person: zero, payerName: 'Maya', merchant: 'X', demo: false, payment: { method: 'paypal', handle: 'SplitCoreExample', profileUrl: '' } });
  assert.equal(r.link, null);
  assert.equal(r.qrPayload, null);
  assert.equal(buildRequest({ person: zero, payerName: 'Maya', merchant: 'X', demo: true, payment: { method: 'none' } }).qrPayload, null);
});

test('restaurant matching: whole names only, never partial words', () => {
  const cases = {
    'Chick-fil-A': 'chickfila', 'CHICK-FIL-A #01234': 'chickfila', 'CHICK FIL A': 'chickfila', "McDonald's": 'mcdonalds',
    'Wendy’s': 'wendys', "DOMINO'S PIZZA #4421": 'dominos', 'Pizza Hut Express': 'pizzahut', 'PAPA JOHNS': 'papajohns',
    'Raising Cane’s Chicken Fingers': 'canes', 'Noodles & Company': 'noodles', 'Taco Bell #031': 'tacobell',
    'WHATABURGER #1027': 'whataburger', 'DQ GRILL & CHILL': 'dq', 'Jersey Mike’s Subs': 'jerseymikes', 'Torchy’s Tacos': 'torchys',
  };
  for (const [text, id] of Object.entries(cases)) assert.equal(matchMerchant(text)?.id, id, text);
  for (const text of ['Wendy burger', 'SPLITCORE CAFE', 'THE PIZZA SHACK', 'PENNY DINER', 'DQUICK MART', 'Starbuck Lane Diner', '']) {
    assert.equal(matchMerchant(text), null, text);
  }
});

test('findRewards uses merchant, header, then printed website — never item lines', () => {
  const pizza = parseReceipt('THE PIZZA SHACK\n1 PIZZA HUT STYLE CRUST 12.00\n1 WENDYS FRIES 3.00\nTOTAL 15.00');
  assert.deepEqual(findRewards(pizza), { entry: null, via: 'none', evidence: '' });
  const header = parseReceipt('WELCOME\nDOMINOS\nSTORE 8812\nPIZZA 10.00\nTOTAL 10.00');
  assert.equal(findRewards(header).entry?.id, 'dominos');
  const site = parseReceipt('STORE 1234\nPIZZA 10.00\nTOTAL 10.00\nOrder at www.papajohns.com');
  assert.deepEqual([findRewards(site).entry?.id, findRewards(site).via, findRewards(site).evidence], ['papajohns', 'website', 'papajohns.com']);
  const a = parseReceipt(SAMPLE_A);
  assert.equal(findRewards(a).entry?.id, 'chickfila');
  assert.equal(findRewards(a).via, 'name');
  // The user's own choices win, including "none".
  assert.equal(findRewards({ ...a, rewardsChoice: 'none' }).entry, null);
  assert.equal(findRewards({ ...a, rewardsChoice: 'starbucks' }).entry?.id, 'starbucks');
  // An edited merchant name is the only evidence used.
  assert.equal(findRewards({ ...site, merchant: 'Corner Cafe', merchantEdited: true }).entry, null);
  assert.equal(findRewards({ ...site, merchant: 'Pizza Hut', merchantEdited: true }).entry?.id, 'pizzahut');
});

test('rewards directory entries are complete and safe', () => {
  const ids = new Set();
  for (const e of DIRECTORY) {
    assert.ok(!ids.has(e.id), `unique id ${e.id}`); ids.add(e.id);
    assert.match(e.url, /^https:\/\/[a-z0-9.-]+\//, e.id);
    const host = new URL(e.url).hostname.replace(/^www\./, '');
    assert.ok(e.domains.some(d => host === d || host.endsWith(`.${d}`)) || (e.id === 'burgerking' && host === 'bk.com'), `${e.id} url on its own domain`);
    assert.ok(e.program && e.name && e.category && e.aliases.length, e.id);
    for (const l of e.claim?.links ?? []) assert.match(l.href, /^https:\/\/www\./);
  }
  assert.equal(VERIFIED_ON, '2026-10-24');
  assert.equal(searchDirectory('pizza').map(e => e.id).includes('dominos'), true);
  assert.equal(searchDirectory('chick')[0].id, 'chickfila'); // name match ranks above "Chicken" category
  assert.ok(searchDirectory('chick').some(e => e.id === 'canes'));
  assert.deepEqual(searchDirectory('zzzz'), []);
});

test('rewards detail pack uses printed receipt total and sample warning', () => {
  const r = parseReceipt(SAMPLE_A);
  r.finalPaidCents = 3354; r.extraTipCents = 500;
  const pack = receiptDetails(/** @type {any} */ (matchMerchant(r.merchant)), r, true);
  assert.match(pack.text, /^DO NOT SUBMIT — SAMPLE/);
  assert.match(pack.text, /Receipt total: \$28\.54/);
  assert.ok(!pack.text.includes('33.54'));
  assert.match(pack.text, /Order number: DEMO-101/);
  const missing = receiptDetails(DIRECTORY[1], parseReceipt('MCDONALDS\nFRIES 2.00\nTOTAL 2.00'), false);
  assert.ok(missing.rows.some(x => x.label === 'Time' && x.value === 'not recognized'));
});
