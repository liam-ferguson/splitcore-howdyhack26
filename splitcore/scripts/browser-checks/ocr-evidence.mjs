import { fileURLToPath } from 'node:url';
// Upload images through the real "Choose image" input (real mode) and record OCR + parsed fields.
import { launch, sleep } from './cdp.mjs';
const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const files = process.argv.slice(2).length ? process.argv.slice(2) : [
  `${ROOT}/public/demo/sample-a.png`, `${ROOT}/public/demo/sample-b.png`, `${ROOT}/public/demo/sample-c.png`,
  `${ROOT}/fixtures/penny-diner-changed.png`, `${ROOT}/fixtures/renamed-receipt-photo.png`, `${ROOT}/fixtures/sample-a-tax-typo.png`,
];
const page = await launch({ width: 1440, height: 900 });
try {
  for (const f of files) {
    await page.goto('http://127.0.0.1:4173/');
    const t0 = Date.now();
    await page.setFile('input[type=file][accept^="image/png"]', f);
    await page.waitFor(`document.querySelector('#claim-title') || document.querySelector('.notice-warning[role=alert]')`, 90000);
    const ms = Date.now() - t0;
    const data = await page.eval(`
      const items=[...document.querySelectorAll('article.item')].map(a=>a.querySelector('.item-name').innerText+' | '+a.querySelector('.item-head .muted').innerText+' | '+a.querySelector('.amount-md').innerText);
      return { merchant: document.querySelector('.merchant-name')?.innerText, total: document.querySelector('.strip-total .amount')?.innerText,
        check: document.querySelector('.corecheck')?.innerText.replace(/\\s+/g,' '), items, alert: document.querySelector('[role=alert]')?.innerText };`);
    await page.click('View source').catch(() => {});
    await sleep(200);
    const raw = await page.eval(`return document.querySelector('.raw-text')?.innerText`);
    console.log(`\n=== ${f.split('/').pop()} (${ms} ms wall incl. navigation)`);
    console.log(JSON.stringify(data, null, 1));
    console.log('--- raw OCR text ---\n' + raw);
  }
  console.log('ERRORS', page.errors);
} finally { await page.close(); }
