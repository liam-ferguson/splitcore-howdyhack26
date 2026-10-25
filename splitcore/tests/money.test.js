import test from 'node:test';
import assert from 'node:assert/strict';
import { apportion, centsToPlain, formatMoney, parseCents } from '../src/domain/money.js';

test('parseCents accepts supported dollar forms', () => {
  assert.equal(parseCents('12'), 1200);
  assert.equal(parseCents('12.3'), 1230);
  assert.equal(parseCents('$12.30'), 1230);
  assert.equal(parseCents(' 0.05 '), 5);
  assert.equal(parseCents('1,234.56'), 123456);
  assert.equal(parseCents('12,345'), 1234500);
  assert.equal(parseCents('100000'), 10_000_000);
});

test('parseCents rejects malformed and out-of-bound input', () => {
  for (const bad of ['', '   ', '-1', '-$1.00', 'NaN', 'Infinity', '1e3', '1E2', '12.345', '1,23', '12,34.00',
    ',123', '1,2345', '$', '.', '12.', '1.2.3', 'abc', '100000.01', '99999999999', '0x10', '+5']) {
    assert.equal(parseCents(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(parseCents(/** @type {any} */ (12)), null);
});

test('formatMoney and centsToPlain are presentation of integers', () => {
  assert.equal(formatMoney(2252), '$22.52');
  assert.equal(formatMoney(-280), '−$2.80');
  assert.equal(formatMoney(123456789), '$1,234,567.89');
  assert.equal(centsToPlain(911), '9.11');
  assert.equal(centsToPlain(1), '0.01');
  assert.equal(centsToPlain(1000), '10.00');
  assert.equal(centsToPlain(123456), '1234.56');
});

const eq3 = [{ id: 'a', weight: 1, order: 0 }, { id: 'b', weight: 1, order: 1 }, { id: 'c', weight: 1, order: 2 }];

test('apportion: equal weights and stable ties', () => {
  assert.deepEqual(apportion(1001, eq3), { a: 334, b: 334, c: 333 });
  assert.deepEqual(apportion(1, eq3), { a: 1, b: 0, c: 0 });
  assert.deepEqual(apportion(1002, eq3), { a: 334, b: 334, c: 334 });
  // Tie order follows `order`, not array position.
  const reordered = [{ id: 'c', weight: 1, order: 2 }, { id: 'a', weight: 1, order: 0 }, { id: 'b', weight: 1, order: 1 }];
  assert.deepEqual(apportion(1001, reordered), { a: 334, b: 334, c: 333 });
});

test('apportion: zero total, zero weights, and missing basis', () => {
  assert.deepEqual(apportion(0, eq3), { a: 0, b: 0, c: 0 });
  assert.deepEqual(apportion(0, eq3.map(e => ({ ...e, weight: 0 }))), { a: 0, b: 0, c: 0 });
  assert.throws(() => apportion(5, eq3.map(e => ({ ...e, weight: 0 }))), /remaining charges/);
  assert.deepEqual(apportion(100, [{ id: 'a', weight: 0, order: 0 }, { id: 'b', weight: 3, order: 1 }]), { a: 0, b: 100 });
});

test('apportion: invalid inputs throw', () => {
  assert.throws(() => apportion(-1, eq3));
  assert.throws(() => apportion(1.5, eq3));
  assert.throws(() => apportion(10, [{ id: 'a', weight: -1, order: 0 }]));
  assert.throws(() => apportion(10, [{ id: 'a', weight: 0.5, order: 0 }]));
  assert.throws(() => apportion(10, [{ id: 'a', weight: 1, order: 0 }, { id: 'a', weight: 1, order: 1 }]), /Duplicate/);
});

test('apportion: fixture A tax/service/tip buckets', () => {
  const w = [{ id: 'maya', weight: 828, order: 0 }, { id: 'jordan', weight: 684, order: 1 }, { id: 'sam', weight: 1008, order: 2 }];
  assert.deepEqual(apportion(208, w), { maya: 68, jordan: 57, sam: 83 });
  assert.deepEqual(apportion(126, w), { maya: 42, jordan: 34, sam: 50 });
  assert.deepEqual(apportion(500, w), { maya: 164, jordan: 136, sam: 200 });
});

test('apportion: bounded deterministic conservation loop', () => {
  let seed = 12345;
  const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let k = 0; k < 600; k++) {
    const count = 1 + rand(12);
    const entries = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, weight: rand(5) === 0 ? 0 : rand(100000), order: i }));
    if (entries.every(e => e.weight === 0)) entries[0].weight = 1;
    const total = rand(10_000_001);
    const out = apportion(total, entries);
    const W = entries.reduce((s, e) => s + e.weight, 0);
    let sum = 0;
    for (const e of entries) {
      const c = out[e.id];
      assert.ok(Number.isSafeInteger(c) && c >= 0);
      const quota = (BigInt(total) * BigInt(e.weight));
      const floor = Number(quota / BigInt(W));
      const ceil = quota % BigInt(W) === 0n ? floor : floor + 1;
      assert.ok(c >= floor && c <= ceil, `allocation within floor/ceil of quota`);
      sum += c;
    }
    assert.equal(sum, total);
  }
});
