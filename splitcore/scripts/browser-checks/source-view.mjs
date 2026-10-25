// P2 inline source highlighting: uncertain pasted receipt, open "View source".
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';
const out = fileURLToPath(new URL('./out/source-view.png', import.meta.url));
const page = await launch({ width: 390, height: 844, mobile: true, port: 9800 });
try {
  await page.goto('http://127.0.0.1:4173/');
  await page.click('Paste receipt text');
  await page.type('#paste-text', 'CORNER CAFE\nDATE 10/24/2026\nBURGER 8.00\nFRIES 4.8\nCOUPON -1.00\nTAX 0.70\nTOTAL 12.50\nCASH 20.00');
  await page.click('Read text');
  await page.waitFor(`document.querySelector('#claim-title')`);
  await page.click('View source'); await sleep(300);
  console.log(await page.eval(`return [...document.querySelectorAll('dialog[open] .raw-text .src-line')].map(s=>s.className.replace('src-line','').trim().padEnd(10)+' '+s.textContent.trim()).join(String.fromCharCode(10))`));
  await page.shot(out);
  console.log('errors', page.errors);
} finally { await page.close(); }
