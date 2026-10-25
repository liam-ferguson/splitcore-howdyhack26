// Upload photo-like receipts (fixtures/photo-like) through the real file input and compare every
// parsed field with what is printed. Run make-photo-fixtures.py first.
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const OUT = fileURLToPath(new URL('./out', import.meta.url));
mkdirSync(OUT, { recursive: true });

const EXPECT = {
  'pizza-night': { merchant: "MARCO'S PIZZERIA", items: [['LG PEPPERONI PIZZA', 1, 1899], ['GARLIC KNOTS', 1, 649], ['FOUNTAIN DRINK', 2, 598], ['CAESAR SALAD', 1, 825]], total: 4299, tax: 328 },
  'burger-bar': { merchant: 'THE BURGER BARN', items: [['CLASSIC BURGER', 2, 2398], ['BBQ BACON BURGER', 1, 1349], ['SWEET TEA', 3, 897], ['ONION RINGS', 1, 575]], total: 5108, tax: 389, discount: 500 },
  'cafe-comma': { merchant: 'CORNER CAFE', items: [['LATTE', 1, 475], ['BLUEBERRY MUFFIN', 1, 325], ['BAGEL W/ CREAM CHEESE', 2, 790]], total: 1721, tax: 131 },
};
const files = Object.keys(EXPECT).flatMap(n => [n, `${n}-hard`]);
const page = await launch({ width: 1440, height: 900, port: 9980 });
const rows = [];
try {
  for (const name of files) {
    const exp = EXPECT[name.replace(/-hard$/, '')];
    await page.goto('http://127.0.0.1:4173/');
    const t0 = Date.now();
    await page.setFile('input[type=file][accept^="image/png"]', `${ROOT}/fixtures/photo-like/${name}.jpg`);
    let stages = new Set();
    for (let i = 0; i < 600; i++) {
      const st = await page.eval(`return document.querySelector('.scan-stage')?.innerText ?? (document.querySelector('#claim-title') ? 'DONE' : document.querySelector('[role=alert]') ? 'ALERT' : '')`);
      if (st) stages.add(st.replace(/…$/, ''));
      if (st === 'DONE' || st === 'ALERT') break;
      await sleep(150);
    }
    const ms = Date.now() - t0;
    const data = await page.eval(`
      const items=[...document.querySelectorAll('article.item')].map(a=>({ name: a.querySelector('.item-name').innerText, meta: a.querySelector('.item-title .muted').innerText, amt: a.querySelector('.amount-md').innerText }));
      return { merchant: document.querySelector('.merchant-name')?.innerText ?? null, total: document.querySelector('.receipt-total .amount-lg')?.innerText ?? null,
        check: document.querySelector('.cc-text')?.innerText ?? document.querySelector('[role=alert]')?.innerText ?? null, items };`);
    const cents = s => s ? Math.round(Number(s.replace(/[$,]/g, '')) * 100) : null;
    const got = data.items.map(i => [i.name, Number((/^(\d+) units/.exec(i.meta) ?? [0, 1])[1]), cents(i.amt)]);
    const itemsOk = JSON.stringify(got) === JSON.stringify(exp.items);
    const totalOk = cents(data.total) === exp.total;
    const adds = /adds up/i.test(data.check ?? '');
    rows.push({ name, ms, passes: [...stages].filter(s => /pass/.test(s)).length + 1, merchant: data.merchant, merchantOk: data.merchant === exp.merchant, itemsOk, totalOk, adds, check: data.check, got });
    console.log(`${itemsOk && totalOk && adds ? 'PASS' : 'FAIL'} ${name.padEnd(17)} ${String(ms).padStart(5)}ms passes=${rows.at(-1).passes} merchant=${data.merchant} total=${data.total} | ${data.check}`);
    if (!itemsOk) console.log('      items:', JSON.stringify(got));
    if (!(itemsOk && totalOk && adds)) {
      await page.click('View source').catch(() => {});
      await sleep(200);
      console.log('      raw:', JSON.stringify(await page.eval(`return document.querySelector('.raw-text')?.innerText ?? ''`)));
      await page.key('Escape', 'Escape', 27);
    }
  }
  console.log('errors', page.errors);
} finally {
  writeFileSync(`${OUT}/photo-ocr.json`, JSON.stringify(rows, null, 1));
  console.log(`\n${rows.filter(r => r.itemsOk && r.totalOk && r.adds).length}/${rows.length} photo-like receipts read exactly`);
  await page.close();
}
