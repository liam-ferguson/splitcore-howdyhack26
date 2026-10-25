import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
const S = process.env.OUT ?? fileURLToPath(new URL('./out', import.meta.url));
mkdirSync(S, { recursive: true });
const out = [];
const check = (n, ok, d = '') => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const LONG = 'MAXIMILIANA-ALEXANDRA';
const longReceipt = `THE VERY LONG NAMED NEIGHBORHOOD BISTRO AND GRILL\n1 EXTRAORDINARILY LONG DESCRIPTION OF A SEAFOOD PLATTER 1,234.56\n2 x DRINK 3.20\nTAX 99.99\nTOTAL 1,337.75`;

for (const [w, h, label] of [[390, 844, 'mobile'], [320, 700, 'narrow320'], [640, 450, 'zoom200-of-1280x900'], [1440, 900, 'desktop']]) {
  const page = await launch({ width: w, height: h, mobile: w < 768, port: 9400 + w });
  try {
    await page.goto('http://127.0.0.1:4173/');
    const overflow = () => page.eval(`return document.documentElement.scrollWidth - document.documentElement.clientWidth`);
    check(`${label}: Snap no horizontal scroll`, (await overflow()) <= 0, `${await overflow()}px`);
    await page.shot(`${S}/v-${label}-snap.png`);
    await page.click('Paste receipt text');
    await page.type('#paste-text', longReceipt);
    await page.click('Read text'); await page.waitFor(`document.querySelector('#claim-title')`);
    for (const n of [LONG, 'Jo', 'Sam', 'Priya']) { await page.type('#f-add-diner', n); await page.click('Add', '.add-diner'); }
    await page.eval(`[...document.querySelectorAll('[role=group]')].forEach(g=>g.querySelector('button').click())`);
    await sleep(100);
    await page.click('Same as receipt'); await page.click('Confirm');
    check(`${label}: Claim no horizontal scroll`, (await overflow()) <= 0, `${await overflow()}px`);
    await sleep(1300); // let entrance animations (which scale cards) finish before measuring geometry
    const chip = await page.eval(`const b=document.querySelector('.chip'); return {aria: b.innerText, h: b.getBoundingClientRect().height}`);
    check(`${label}: long name chip keeps full text, >=44px`, chip.aria.includes(LONG) && chip.h >= 44, JSON.stringify(chip));
    await page.shot(`${S}/v-${label}-claim.png`);
    if (w < 1024) {
      // Scroll to bottom: last content must clear the fixed dock
      await page.eval(`window.scrollTo(0, document.documentElement.scrollHeight)`); await sleep(150);
      const gap = await page.eval(`const d=document.querySelector('.dock').getBoundingClientRect().top; const items=[...document.querySelectorAll('main .main-col > *')]; const last=items[items.length-1].getBoundingClientRect().bottom; return d - last`);
      check(`${label}: dock never covers last content`, gap >= 0, `${gap}px clearance`);
      // Focused field is not hidden by dock
      await page.eval(`document.getElementById('f-paid').focus(); document.getElementById('f-paid').scrollIntoView({block:'center'})`); await sleep(100);
      const cover = await page.eval(`const d=document.querySelector('.dock').getBoundingClientRect().top; return d - document.getElementById('f-paid').getBoundingClientRect().bottom`);
      check(`${label}: focused paid field above dock`, cover > 0, `${cover}px`);
      await page.shot(`${S}/v-${label}-claim-bottom.png`);
    }
    await page.eval(`window.scrollTo(0,0)`);
    await page.click('Review split'); await sleep(200);
    check(`${label}: Settle no horizontal scroll`, (await overflow()) <= 0, `${await overflow()}px`);
    await page.shot(`${S}/v-${label}-settle.png`);
    if (label === 'mobile') {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await page.eval(`document.querySelector('details.disclosure').open = true`); await sleep(50);
      const anim = await page.eval(`return getComputedStyle(document.querySelector('details.disclosure[open] > table')).animationName + '/' + getComputedStyle(document.querySelector('.btn')).transitionDuration`);
      check('reduced motion removes animation/transition', anim.startsWith('none/0s'), anim);
    }
    check(`${label}: no runtime errors`, page.errors.length === 0, page.errors.join('|'));
  } catch (e) { console.log('ABORT', label, e.message); await page.shot(`${S}/v-abort-${label}.png`, true); }
  finally { await page.close(); }
}
console.log(`${out.filter(Boolean).length}/${out.length} passed`);
