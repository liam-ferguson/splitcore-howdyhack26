// End to end: paste a receipt, quick-add 2 people, set each payment method, read the generated
// pay link from the app, then open it in Chrome and confirm the provider page loads with the amount.
// Public page loads only — never signs in or pays. Uses each provider's own official handle.
import { launch, sleep } from './cdp.mjs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const page = await launch({ width: 1440, height: 900, port: 9990, args: [`--user-agent=${UA}`] });
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
try {
  await page.goto('http://127.0.0.1:4173/');
  await page.click('Paste receipt text');
  await page.type('#paste-text', 'TACO SHACK\n2 TACOS 9.00\nTAX 0.74\nTOTAL 9.74');
  await page.click('Read text');
  await page.waitFor(`document.querySelector('#claim-title')`);
  await page.click('2 people'); await sleep(300);
  check('no input needed: split ready right after choosing 2 people', await page.eval(`return !document.querySelector('.summary .btn-primary').disabled`));
  await page.click('Send requests'); await sleep(500);
  const cases = [
    ['PayPal', 'PayPal', /paypal\.com\/paypalme\/PayPal\/4\.87USD/],
    ['Venmo', 'Venmo', /account\.venmo\.com\/payment-link\?.*amount=4\.87.*recipients=Venmo/],
  ];
  const links = {};
  for (const [label, handle] of cases) {
    await page.eval(`[...document.querySelectorAll('.seg')].find(l=>l.innerText.includes(${JSON.stringify(label)})).querySelector('input').click()`);
    await sleep(100);
    await page.clear('#f-pay-handle'); await page.type('#f-pay-handle', handle); await sleep(200);
    links[label] = await page.eval(`return document.querySelector('.pay-link-btn')?.getAttribute('href')`);
    console.log(`  ${label} link in app: ${links[label]}`);
  }
  check('Friend 2 owes $4.87 (half of $9.74)', links.PayPal?.endsWith('/4.87USD'));
  for (const [label, , expect] of cases) {
    await page.send('Page.navigate', { url: links[label] });
    await sleep(7000);
    const url = await page.eval(`return location.href`);
    const title = await page.eval(`return document.title`);
    check(`${label} link opens the provider's pay page with the amount`, expect.test(url), `${url} | ${title}`);
  }
} catch (e) { console.log('ABORT', e.message); results.push(false); }
finally { console.log(`${results.filter(Boolean).length}/${results.length} passed`); await page.close(); }
