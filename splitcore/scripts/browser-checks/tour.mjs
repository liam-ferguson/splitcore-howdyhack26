// Visual tour: screenshots of every major state. Usage: node tour.mjs [width] [height]
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const OUT = process.env.OUT ?? fileURLToPath(new URL('./out', import.meta.url));
mkdirSync(OUT, { recursive: true });
const W = Number(process.argv[2] ?? 390), H = Number(process.argv[3] ?? 844);
const tag = `${W}`;
const page = await launch({ width: W, height: H, mobile: W < 768, port: 9900 + (W % 97) });
const shot = async (name, full = false) => { await sleep(900); await page.shot(`${OUT}/tour-${tag}-${name}.png`, full); };
const chip = async (unit, name) => {
  await page.eval(`const g=[...document.querySelectorAll('[role=group]')].find(g=>g.getAttribute('aria-label')==='Who had ${unit}'); [...g.querySelectorAll('button')].find(b=>b.innerText.includes('${name}')).click();`);
  await sleep(60);
};
try {
  await page.goto('http://127.0.0.1:4173/');
  await shot('01-snap');
  await page.click('Try a sample');
  await shot('02-demo', true);
  await page.eval(`[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Scan sample image'))[0].click()`);
  await sleep(500);
  await page.shot(`${OUT}/tour-${tag}-03-scanning.png`);
  await page.waitFor(`document.querySelector('#claim-title')`, 90000);
  await shot('04-claim-top');
  await chip('SANDWICH 1 of 2', 'Maya'); await chip('SANDWICH 2 of 2', 'Jordan'); await chip('NUGGETS', 'Sam');
  await page.click('Share FRIES with everyone');
  await chip('DRINK 1 of 2', 'Maya');
  await page.eval(`document.querySelector('[aria-label="Who had DRINK 1 of 2"]').scrollIntoView({block:'center'})`);
  await shot('05-claim-items');
  await chip('DRINK 2 of 2', 'Sam');
  await page.type('#f-paid', '33.54');
  await page.click('The extra $5.00 was tip');
  await page.click('Confirm $33.54 paid');
  await shot('06-claim-ready');
  await page.eval(`window.scrollTo(0,0)`);
  await page.click('Review split');
  await sleep(1500);
  await shot('07-settle');
  await shot('08-settle-full', true);
  await page.click('Demo QR');
  await shot('09-qr');
  await page.key('Escape', 'Escape', 27);
  await page.click('Add this visit');
  await shot('10-rewards');
  await page.key('Escape', 'Escape', 27);
  await page.click('Not Chick-fil-A?');
  await shot('11-picker');
  await page.type('#picker-q', 'pizza');
  await shot('12-picker-search');
  console.log('errors', page.errors);
} catch (e) { console.log('ABORT', e.message); await page.shot(`${OUT}/tour-${tag}-abort.png`, true); console.log('errors', page.errors); }
finally { await page.close(); }
