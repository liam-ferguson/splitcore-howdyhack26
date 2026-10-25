import { fileURLToPath } from 'node:url';
// Fixture A end-to-end via the UI. Usage: node flowA.mjs [text|image] [width] [height]
import { launch, sleep } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
const S = process.env.OUT ?? fileURLToPath(new URL('./out', import.meta.url));
mkdirSync(S, { recursive: true });
const via = process.argv[2] ?? 'text';
const W = Number(process.argv[3] ?? 390), H = Number(process.argv[4] ?? 844);
const tag = `${via}-${W}`;
const page = await launch({ width: W, height: H, mobile: W < 768 });
const log = (...a) => console.log(...a);
try {
  await page.goto('http://127.0.0.1:4173/');
  await page.click('Try a sample');
  const t0 = Date.now();
  if (via === 'text') {
    await page.eval(`[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Use sample text'))[0].click()`);
  } else {
    await page.eval(`[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Scan sample image'))[0].click()`);
    let lastStage = '';
    for (let i = 0; i < 600; i++) {
      const st = await page.eval(`return document.querySelector('.scan-stage')?.innerText ?? (document.querySelector('#claim-title') ? 'DONE' : document.querySelector('.notice-warning')?.innerText ?? '?')`);
      if (st !== lastStage) { log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${st}`); lastStage = st; }
      if (st === 'DONE' || i === 30 && W === 9999) break;
      if (st && st.includes("Couldn't")) throw new Error(st);
      if (i === 20) await page.shot(`${S}/scan-progress-${tag}.png`);
      await sleep(250);
    }
    log('OCR wall time ms', Date.now() - t0);
  }
  await page.waitFor(`document.querySelector('#claim-title')`);
  const raw = await page.eval(`return document.body.innerText.includes('Amounts match')`);
  log('Amounts match shown:', raw);
  await page.shot(`${S}/claim-top-${tag}.png`);
  await page.click('Confirm restaurant');
  // claim units: chips are in order of items/units; use aria-labels on groups
  const tapChip = async (unitLabel, name) => {
    const ok = await page.eval(`const g=[...document.querySelectorAll('[role=group]')].find(g=>g.getAttribute('aria-label')==='Who had ${unitLabel}');
      if(!g) return 'nogroup'; const b=[...g.querySelectorAll('button')].find(b=>b.innerText.includes('${name}')); if(!b) return 'nochip'; b.scrollIntoView({block:'center'}); b.click(); await new Promise(r=>setTimeout(r,50)); return b.getAttribute('aria-pressed');`);
    if (ok !== 'true') throw new Error(`chip ${unitLabel}/${name}: ${ok}`);
    await sleep(60);
  };
  await tapChip('SANDWICH 1 of 2', 'Maya');
  await tapChip('SANDWICH 2 of 2', 'Jordan');
  await tapChip('NUGGETS', 'Sam');
  await page.shot(`${S}/claim-partial-${tag}.png`);
  log('progress:', await page.eval(`return document.querySelector('.items .section-head p').innerText`));
  await page.click('Share FRIES with everyone');
  await tapChip('DRINK 1 of 2', 'Maya');
  await tapChip('DRINK 2 of 2', 'Sam');
  log('progress:', await page.eval(`return document.querySelector('.items .section-head p').innerText`));
  log('reason:', await page.eval(`return document.querySelector('.dock-status').innerText`));
  await page.type('#f-paid', '33.54');
  await sleep(150);
  log('paid notice:', await page.eval(`return document.querySelector('.paid').innerText.replace(/\\s+/g,' ')`));
  await page.click('The extra $5.00 was tip');
  await page.click('Confirm $33.54 paid');
  log('paid status:', await page.eval(`return document.querySelector('.paid .status-ok')?.innerText`));
  log('dock:', await page.eval(`return document.querySelector('.dock-status').innerText`));
  await page.shot(`${S}/claim-done-${tag}.png`, true);
  await page.click('Review split');
  await sleep(200);
  await page.shot(`${S}/settle-${tag}.png`);
  await page.eval(`document.querySelectorAll('details.disclosure').forEach(d=>{ if(d.querySelector('summary').innerText.includes('math')) d.open = true; })`);
  await sleep(500);
  await page.shot(`${S}/settle-full-${tag}.png`, true);
  const text = await page.text();
  log(text.slice(0, 2600));
  log('ERRORS', page.errors);
  log('REQUESTS (non-local):', [...new Set(page.requests.filter(r => !r.url.startsWith('http://127.0.0.1') && !r.url.startsWith('data:') && !r.url.startsWith('blob:')).map(r => `${r.method} ${r.url}`))]);
} finally { await page.close(); }
