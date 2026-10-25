// Report elements wider than the viewport on the Claim screen with long content.
// Usage: node overflow.mjs [width]
import { launch, sleep } from './cdp.mjs';
const W = Number(process.argv[2] ?? 320);
const page = await launch({ width: W, height: 700, mobile: true, port: 9950 });
try {
  await page.goto('http://127.0.0.1:4173/');
  await page.click('Paste receipt text');
  await page.type('#paste-text', ['THE VERY LONG NAMED NEIGHBORHOOD BISTRO AND GRILL', '1 EXTRAORDINARILY LONG DESCRIPTION OF A SEAFOOD PLATTER 1,234.56', '2 x DRINK 3.20', 'TAX 99.99', 'TOTAL 1,337.75'].join('\n'));
  await page.click('Read text'); await page.waitFor(`document.querySelector('#claim-title')`);
  for (const n of ['MAXIMILIANA-ALEXANDRA', 'Jo', 'Sam', 'Priya']) { await page.type('#f-add-diner', n); await page.click('Add person'); }
  await sleep(1500);
  const rows = await page.eval(`const vw = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > vw + 0.5 && r.width > 0; })
      .slice(0, 12).map(e => e.tagName + '.' + String(e.className).slice(0, 40) + ' right=' + Math.round(e.getBoundingClientRect().right) + ' w=' + Math.round(e.getBoundingClientRect().width));`);
  console.log(rows.length ? rows.join('\n') : 'no overflow');
  // Elements wider than their parent's content box: the real culprits.
  const culprits = await page.eval(`return [...document.querySelectorAll('body *')].filter(e => {
      const p = e.parentElement; if (!p || getComputedStyle(e).position === 'fixed' || getComputedStyle(e).position === 'absolute') return false;
      const cs = getComputedStyle(p); const inner = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return e.getBoundingClientRect().width > inner + 1 && p.clientWidth > 0;
    }).slice(0, 10).map(e => e.tagName + '.' + String(e.className).slice(0, 50) + ' in ' + String(e.parentElement.className).slice(0, 40) + ' w=' + Math.round(e.getBoundingClientRect().width) + ' parentInner=' + Math.round(e.parentElement.clientWidth));`);
  console.log('culprits:\n' + culprits.join('\n'));
  console.log('doc', await page.eval(`return [document.documentElement.clientWidth, document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth].join(' ')`));
} finally { await page.close(); }
