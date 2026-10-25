import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, checkPayment, demoPayload, normalizePaypal, paypalLink, validateProviderUrl } from '../src/domain/requests.js';
import { matchMerchant, receiptDetails, DIRECTORY } from '../src/domain/rewards.js';
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

test('Venmo/Cash App: copy handle and amount; never synthesize amount links', () => {
  const v = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'Cafe', demo: false,
    payment: { method: 'venmo', handle: 'maya-example', profileUrl: 'https://venmo.com/u/maya-example' } });
  assert.equal(v.copyHandle, '@maya-example');
  assert.equal(v.link?.href, 'https://venmo.com/u/maya-example');
  assert.equal(v.link?.kind, 'recipient');
  assert.equal(v.qrLabel, 'Recipient link; enter $9.11 in the payment app.');
  assert.ok(!v.link.href.includes('9.11'));
  const c = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'Cafe', demo: false, payment: { method: 'cashapp', handle: '$MayaEx', profileUrl: '' } });
  assert.equal(c.link, null);
  assert.equal(c.qrPayload, null);
  assert.match(c.message, /on Cash App \(\$MayaEx\)/);
  const badUrl = checkPayment({ method: 'venmo', handle: 'maya-example', profileUrl: 'https://evil.com/x' });
  assert.equal(badUrl.ok, true);
  assert.equal(badUrl.url, null);
  assert.ok(badUrl.urlError);
});

test('real PayPal request and reminder text', () => {
  const r = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'Chick-fil-A', demo: false, payment: { method: 'paypal', handle: 'SplitCoreExample', profileUrl: '' } });
  assert.equal(r.link?.href, 'https://paypal.me/SplitCoreExample/9.11USD');
  assert.equal(r.qrPayload, 'https://paypal.me/SplitCoreExample/9.11USD');
  assert.equal(r.message, [
    'Hey Jordan! Your share at Chick-fil-A is $9.11. SANDWICH 2 of 2 $6.00, 1/3 of FRIES $1.60.',
    'Food after discounts $6.84; tax $0.57; service $0.34; extra tip $1.36.',
    'Please send $9.11 to Maya via PayPal: https://paypal.me/SplitCoreExample/9.11USD. Thanks!',
  ].join('\n'));
  const none = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'Cafe', demo: false, payment: { method: 'none', handle: '', profileUrl: '' } });
  assert.equal(none.link, null);
  assert.equal(none.qrPayload, null);
  assert.match(none.message, /Please send \$9\.11 to Maya\. Thanks!$/);
});

test('demo never returns an active financial link', () => {
  for (const payment of [
    { method: 'none', handle: '', profileUrl: '' },
    { method: 'paypal', handle: 'SplitCoreExample', profileUrl: '' },
    { method: 'venmo', handle: 'maya-example', profileUrl: 'https://venmo.com/u/maya-example' },
  ]) {
    const r = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'Chick-fil-A', demo: true, payment });
    assert.equal(r.link, null);
    assert.equal(r.qrPayload, 'SPLITCORE DEMO | No payment | Jordan | USD 9.11 | Food 6.84 + tax 0.57 + service 0.34 + extra tip 1.36 | Sample only');
    assert.equal(r.qrLabel, 'Demo QR — contains a sample breakdown, not a payment link.');
    assert.ok(r.message.startsWith('DEMO — sample only; no payment requested.\n'));
    assert.ok(!/https?:/.test(r.message));
  }
  const ex = buildRequest({ person: jordan, payerName: 'Maya', merchant: 'X', demo: true, payment: { method: 'paypal', handle: 'SplitCoreExample', profileUrl: '' } });
  assert.equal(ex.formatExample, 'https://paypal.me/SplitCoreExample/9.11USD');
});

test('demo payload format and zero balance', () => {
  assert.equal(demoPayload(jordan), 'SPLITCORE DEMO | No payment | Jordan | USD 9.11 | Food 6.84 + tax 0.57 + service 0.34 + extra tip 1.36 | Sample only');
  const zero = { ...jordan, totalCents: 0, netFoodCents: 0, taxCents: 0, serviceCents: 0, extraTipCents: 0, lines: [] };
  const r = buildRequest({ person: zero, payerName: 'Maya', merchant: 'X', demo: false, payment: { method: 'paypal', handle: 'SplitCoreExample', profileUrl: '' } });
  assert.equal(r.link, null);
  assert.equal(r.qrPayload, null);
  assert.equal(buildRequest({ person: zero, payerName: 'Maya', merchant: 'X', demo: true, payment: { method: 'none' } }).qrPayload, null);
});

test('Points Rescue matching: header names only, full alias', () => {
  assert.equal(matchMerchant('Chick-fil-A')?.id, 'chickfila');
  assert.equal(matchMerchant('CHICK-FIL-A #01234')?.id, 'chickfila');
  assert.equal(matchMerchant("McDonald's")?.id, 'mcdonalds');
  assert.equal(matchMerchant('Wendy’s')?.id, 'wendys');
  assert.equal(matchMerchant('Wendy burger'), null);
  assert.equal(matchMerchant('SPLITCORE CAFE'), null);
  assert.equal(matchMerchant(''), null);
  for (const e of DIRECTORY) {
    assert.equal(e.verifiedOn, '2026-10-24');
    for (const l of e.links) assert.match(l.href, /^https:\/\/www\.(chick-fil-a|mcdonalds|wendys)\.com\//);
  }
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
