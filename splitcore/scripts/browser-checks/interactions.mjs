import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';
import { writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
const S = process.env.OUT ?? fileURLToPath(new URL('./out', import.meta.url));
mkdirSync(S, { recursive: true });
const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const page = await launch({ width: 1440, height: 900 });
const txt = sel => page.eval(`return document.querySelector(${JSON.stringify(sel)})?.innerText ?? null`);
const chip = async (unit, name) => {
  await page.eval(`const g=[...document.querySelectorAll('[role=group]')].find(g=>g.getAttribute('aria-label')==='Who had ${unit}'); [...g.querySelectorAll('button')].find(b=>b.innerText.includes('${name}')).click();`);
  await sleep(40);
};
async function claimA() {
  await chip('SANDWICH 1 of 2', 'Maya'); await chip('SANDWICH 2 of 2', 'Jordan'); await chip('NUGGETS', 'Sam');
  await page.click('Share FRIES with everyone'); await chip('DRINK 1 of 2', 'Maya'); await chip('DRINK 2 of 2', 'Sam');
}
async function demoA() {
  await page.goto('http://127.0.0.1:4173/');
  await page.click('Try a sample');
  await page.eval(`[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Use sample text'))[0].click()`);
  await page.waitFor(`document.querySelector('#claim-title')`);
}
const reviewEnabled = () => page.eval(`return !document.querySelector('.summary .btn-primary').disabled`);

try {
  // 1. Discrepancy + reconfirmation
  await demoA();
  await claimA();
  await page.type('#f-paid', '33.54'); await page.click('The extra $5.00 was tip'); await page.click('Confirm $33.54 paid');
  check('ready after claims + paid', await reviewEnabled());
  await page.click('Edit bill');
  await page.type('#f-taxCents', '1.08');
  await sleep(100);
  const cc = await txt('.corecheck');
  check('tax 2.08→1.08 shows $1 discrepancy', cc.includes('Items and charges are $1.00 below the receipt total. Review the highlighted lines.'));
  check('settlement disabled on discrepancy', !(await reviewEnabled()));
  check('paid confirmation cleared by money edit', !(await page.eval(`return !!document.querySelector('.paid .status-ok')`)));
  check('settle step disabled', await page.eval(`return [...document.querySelectorAll('.step')].find(b=>b.innerText.includes('Settle')).disabled`));
  await page.click('Review', '.corecheck');
  await sleep(200);
  check('Review focuses a correction field', (await page.eval(`return document.activeElement?.id`)) === 'f-taxCents');
  await page.type('#f-taxCents', '2.08'); await sleep(100);
  check('fix restores Amounts match', (await txt('.corecheck')).includes('Amounts match'));
  check('still requires reconfirmation', !(await reviewEnabled()));
  await page.click('Confirm $33.54 paid');
  check('ready again after reconfirm', await reviewEnabled());

  // 2. Unclassified extra blocked; classification only once
  await page.clear('#f-paid'); await page.type('#f-paid', '38.54'); await sleep(100);
  const paidTxt = await txt('.paid');
  check('raising paid by $5 is blocked with classification choice', paidTxt.includes('You paid $10.00 more') && !(await reviewEnabled()), paidTxt.replace(/\s+/g, ' ').slice(0, 160));
  await page.clear('#f-paid'); await page.type('#f-paid', '33.54'); await sleep(100);
  await page.click('Confirm $33.54 paid');
  check('extra tip stays $5 (no duplication)', (await txt('.paid')).includes('$5.00'));

  // 3. Settle; change payer to Sam
  await page.click('Review split'); await sleep(200);
  check('settle headline', (await txt('#settle-title')).startsWith('$22.52'));
  check('settle secondary', (await txt('.settle-sub')) === 'Maya’s share $11.02 · Paid $33.54');
  check('no request card for payer', !(await page.eval(`return [...document.querySelectorAll('article.person:not(.payer-card) h2')].some(h=>h.innerText.includes('Maya'))`)));
  await page.click('Edit claims'); await sleep(150);
  await page.eval(`const s=document.querySelector('#f-payer'); const o=[...s.options].find(o=>o.text==='Sam'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,o.value); s.dispatchEvent(new Event('change',{bubbles:true}));`);
  await sleep(100);
  check('payer Sam: reimbursement $20.13', (await txt('.summary-hero')).includes('$20.13'));
  check('payer Sam: shares unchanged', (await txt('.summary-list')).replace(/\s+/g, ' ').includes('Maya $11.02 Jordan $9.11 Sam (paid) $13.41'));
  await page.eval(`const s=document.querySelector('#f-payer'); const o=[...s.options].find(o=>o.text==='Maya'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,o.value); s.dispatchEvent(new Event('change',{bubbles:true}));`);
  await sleep(100);

  // 4. Rename changes message not numbers
  await page.click('Rename Jordan'); await page.clear('#rn-' + await page.eval(`return document.querySelector('[id^=rn-]').id.slice(3)`));
  await page.type('[id^=rn-]', 'Jordy'); await page.click('Save', '.diner-list'); await sleep(100);
  check('rename keeps amounts', (await txt('.summary-list')).replace(/\s+/g, ' ').includes('Jordy $9.11'));
  check('rename keeps paid confirmation', await reviewEnabled());

  // 5. Unclaim a drink: exact remaining unit, finalized output disappears
  await chip('DRINK 2 of 2', 'Sam'); await sleep(100);
  check('unclaim shows exact remaining unit', (await txt('.summary')).includes('Still unclaimed: DRINK 2 of 2'));
  check('final totals hidden while incomplete', !(await txt('.summary')).includes('to get back'));
  await chip('DRINK 2 of 2', 'Sam');

  // 6. Quantity edit invalidates only that line
  await page.click('Edit DRINK'); await sleep(100);
  const qid = await page.eval(`return document.querySelector('[id^=item-qty-]').id`);
  await page.clear('#' + qid); await page.type('#' + qid, '3'); await page.eval(`document.getElementById('${qid}').blur()`); await sleep(150);
  check('quantity edit notice', (await page.text()).includes('Quantity changed — claims for this line were cleared.'));
  check('other lines keep claims', (await page.eval(`return document.querySelectorAll('.chip-on').length`)) === 6, `${await page.eval(`return document.querySelectorAll('.chip-on').length`)} selected chips remain`);
  check('quantity edit clears paid confirmation', !(await reviewEnabled()));

  // 7. Remove diner restores units to unassigned
  await page.click('Remove Sam'); await sleep(100);
  check('removing Sam unassigns NUGGETS', await page.eval(`return [...document.querySelectorAll('article.item')].find(a=>a.querySelector('.item-name').innerText==='NUGGETS').innerText.includes('Needs owner')`));

  // 8. Settle request contents, clipboard, QR decode
  await demoA(); await page.click('Reset demo'); await page.eval(`[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Use sample text'))[0].click()`);
  await page.waitFor(`document.querySelector('#claim-title')`);
  await claimA(); await page.click('Confirm restaurant');
  await page.type('#f-paid', '33.54'); await page.click('The extra $5.00 was tip'); await page.click('Confirm $33.54 paid');
  await page.click('Review split'); await sleep(300);
  await page.browser.send('Browser.grantPermissions', { origin: 'http://127.0.0.1:4173', permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await page.click('Copy reminder'); await sleep(300);
  const clip = (await page.eval(`return await navigator.clipboard.readText()`)).split(String.fromCharCode(13)).join('');
  check('copied reminder text (Jordan)', clip.startsWith('DEMO — sample only; no payment requested.\nHey Jordan! Your share at Chick-fil-A is $9.11.') && clip.includes('extra tip $1.36'), JSON.stringify(clip));
  check('copy success shown after write', (await page.text()).includes('Copied'));
  await page.browser.send('Browser.resetPermissions', {});
  await page.eval(`navigator.clipboard.writeText = () => Promise.reject(new DOMException('denied','NotAllowedError'))`);
  await sleep(2800); await page.click('Copy reminder'); await sleep(200);
  check('clipboard denied → selectable fallback', await page.eval(`const t=document.querySelector('.copy-fallback textarea'); return !!t && t.value.includes('Hey Jordan') && document.activeElement===t`));
  const payload = await page.eval(`return document.querySelector('.payload code').innerText`);
  check('demo payload exact', payload === 'SPLITCORE DEMO | No payment | Jordan | USD 9.11 | Food 6.84 + tax 0.57 + service 0.34 + extra tip 1.36 | Sample only');
  check('demo has no financial links', !(await page.eval(`return [...document.querySelectorAll('a')].some(a=>/paypal|venmo|cash\\.app/.test(a.href))`)));
  // Screenshot the rendered QR (Jordan) for independent decoding
  const box = await page.eval(`const i=document.querySelector('.qr img'); i.scrollIntoView({block:'center'}); const r=i.getBoundingClientRect(); return {x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height}`);
  await sleep(200);
  const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: box.x - 10, y: box.y - 10, width: box.w + 20, height: box.h + 20, scale: 2 } });
  writeFileSync(`${S}/qr-jordan.png`, Buffer.from(shot.data, 'base64'));
  // Edit assignment → Sam's/Jordan's QR updates
  await page.click('Edit claims'); await sleep(100);
  await chip('NUGGETS', 'Sam'); await chip('NUGGETS', 'Jordan'); await page.click('Review split'); await sleep(300);
  const p2 = await page.eval(`return [...document.querySelectorAll('.payload code')].map(c=>c.innerText)`);
  check('QR payloads update after assignment edit', p2[0].includes('Jordan | USD 18.') && p2[1].includes('Sam |') && !p2[0].includes('9.11'), p2.join(' || '));
  await page.click('Edit claims'); await chip('NUGGETS', 'Jordan'); await chip('NUGGETS', 'Sam'); await page.click('Review split'); await sleep(200);

  // 9. Points Rescue dialog
  const opener = 'See how';
  await page.click(opener); await sleep(200);
  const dlg = await page.eval(`return document.querySelector('dialog[open]')?.innerText`);
  check('Points Rescue shows sample warning', dlg.includes('Sample only — do not submit this receipt.'));
  check('Points Rescue uses receipt total, not paid', dlg.includes('$28.54') && !dlg.includes('$33.54'));
  check('Points Rescue verified date', dlg.includes('Policy checked October 24, 2026'));
  const links = await page.eval(`return [...document.querySelectorAll('dialog[open] a')].map(a=>a.href+' '+a.rel+' '+a.target)`);
  check('official links noopener', links.every(l => l.includes('noopener noreferrer _blank')), links.join(' | '));
  await page.key('Escape', 'Escape', 27); await sleep(200);
  check('Escape closes dialog', !(await page.eval(`return !!document.querySelector('dialog[open]')`)));
  check('focus returns to opener', (await page.eval(`return document.activeElement?.innerText`))?.includes(opener));

  // 10. Real mode PayPal link (pasted text) — string only, not opened
  await page.goto('http://127.0.0.1:4173/');
  await page.click('Paste receipt text');
  await page.type('#paste-text', 'TAPAS 7.01\nTOTAL 7.01');
  await page.click('Read text'); await page.waitFor(`document.querySelector('#claim-title')`);
  await page.type('#f-add-diner', 'Maya'); await page.click('Add', '.add-diner');
  await page.type('#f-add-diner', 'Jordan'); await page.click('Add', '.add-diner');
  await chip('TAPAS', 'Maya'); await chip('TAPAS', 'Jordan');
  await page.click('Same as receipt'); await page.click('Confirm $7.01 paid');
  check('novel pasted receipt totals', (await txt('.summary-list')).replace(/\s+/g, ' ').includes('Maya (paid) $3.51 Jordan $3.50'));
  await page.click('Review split'); await sleep(200);
  await page.eval(`const s=document.querySelector('#f-pay-method'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,'paypal'); s.dispatchEvent(new Event('change',{bubbles:true}));`);
  await sleep(100);
  await page.type('#f-pay-handle', 'SplitCoreExample'); await sleep(150);
  const href = await page.eval(`return [...document.querySelectorAll('a')].find(a=>a.href.includes('paypal.me'))?.getAttribute('href')`);
  check('real PayPal.Me amount link string', href === 'https://paypal.me/SplitCoreExample/3.50USD', href);
  await page.eval(`const s=document.querySelector('#f-pay-method'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,'venmo'); s.dispatchEvent(new Event('change',{bubbles:true}));`);
  await sleep(50);
  await page.clear('#f-pay-handle'); await page.type('#f-pay-handle', 'maya-example');
  await page.type('#f-pay-url', 'https://venmo.com.evil.example/u/maya'); await sleep(100);
  check('lookalike Venmo link rejected with handle fallback', (await page.text()).includes('Pay to @maya-example') && !(await page.eval(`return [...document.querySelectorAll('a')].some(a=>a.href.includes('evil'))`)));
  await page.shot(`${S}/settle-real-venmo.png`, true);

  // 11. Reset demo cancels pending OCR
  await page.goto('http://127.0.0.1:4173/');
  await page.click('Try a sample');
  await page.eval(`[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Scan sample image'))[1].click()`);
  await sleep(250);
  const scanning = await page.eval(`return !!document.querySelector('.scan-stage')`);
  await page.click('Reset demo'); await sleep(4000);
  check('reset during OCR cancels; stale result never lands', scanning && !(await page.eval(`return !!document.querySelector('#claim-title')`)) && !(await page.eval(`return !!document.querySelector('.scan-stage')`)));
  // Cancel then scan another: only the new one lands
  await page.eval(`[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Scan sample image'))[1].click()`);
  await sleep(150);
  await page.click('Cancel scan'); await sleep(100);
  await page.eval(`[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Scan sample image'))[2].click()`);
  await page.waitFor(`document.querySelector('#claim-title')`, 60000); await sleep(1500);
  check('after cancel, new scan result wins', (await txt('.merchant-name')) === 'PENNY DINER');

  // 12. Bad inputs
  await page.goto('http://127.0.0.1:4173/');
  const inputSel = 'input[type=file][accept^="image/png"]';
  for (const [file, expect] of [
    [`${S}/bad.pdf`, 'PDFs are not supported'], [`${S}/bad.heic`, 'HEIC photos are not supported'],
    [`${S}/blank.png`, "Couldn't read this receipt"], [`${S}/big.png`, 'over 16 megapixels'], [`${S}/sideways.png`, null],
  ]) {
    await page.goto('http://127.0.0.1:4173/');
    await page.setFile(inputSel, file);
    await page.waitFor(`document.querySelector('[role=alert]') || document.querySelector('#claim-title')`, 60000);
    const msg = await page.eval(`return document.querySelector('[role=alert]')?.innerText ?? ('CLAIM: ' + document.querySelector('.corecheck')?.innerText.replace(/\\s+/g,' '))`);
    const opts = await page.eval(`return document.querySelector('[role=alert]') ? [...document.querySelectorAll('[role=alert] button')].map(b=>b.innerText).join(', ') : ''`);
    if (expect) check(`bad input ${file.split('/').pop()} recovers`, msg.includes(expect) && opts.includes('Paste receipt text'), `${msg.split('\n')[0]} [${opts}]`);
    else console.log(`INFO sideways.png → ${msg.slice(0, 200)} [${opts}]`);
  }
  // Sideways: rotate and scan again recovers
  if (await page.eval(`return !!document.querySelector('[role=alert]')`)) {
    await page.click('Rotate 90° and scan');
    await page.waitFor(`document.querySelector('#claim-title') || document.querySelector('[role=alert]')`, 60000);
    await sleep(500);
    const after = await page.eval(`return document.querySelector('.corecheck')?.innerText.replace(/\\s+/g,' ') ?? document.querySelector('[role=alert]')?.innerText`);
    check('sideways image recovers via rotate', /Amounts match/.test(after) || /Items/.test(after), after.slice(0, 160));
  }

  // 13. Keyboard: tab to a chip and toggle with Space
  await demoA();
  await page.eval(`document.querySelector('#f-add-diner').focus()`);
  let found = false;
  for (let i = 0; i < 40 && !found; i++) {
    await page.key('Tab', 'Tab', 9);
    found = await page.eval(`return document.activeElement?.classList.contains('chip') && !document.activeElement.classList.contains('chip-quiet')`);
  }
  await page.key(' ', 'Space', 32);
  await sleep(100);
  check('keyboard Tab + Space toggles a chip', found && (await page.eval(`return document.activeElement.getAttribute('aria-pressed')`)) === 'true');
  const outline = await page.eval(`return getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth`);
  check('visible focus outline', outline.startsWith('solid 3px'), outline);

  // 14. Storage: corrupt draft + blocked storage
  await page.goto('http://127.0.0.1:4173/');
  await page.eval(`localStorage.setItem('splitcore:v1:prefs', '{"rememberDraft":true,"rememberNames":true}'); localStorage.setItem('splitcore:v1:draft','{not json'); localStorage.setItem('splitcore:v1:names','[1,2,"Riley"]');`);
  await page.goto('http://127.0.0.1:4173/');
  check('corrupt draft ignored without crash', (await page.text()).includes('One bill') && !(await page.text()).includes('Restore local draft'));
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError')}})` });
  await page.goto('http://127.0.0.1:4173/');
  await page.click('Paste receipt text'); await page.type('#paste-text', 'TAPAS 7.01\nTOTAL 7.01'); await page.click('Read text');
  await page.waitFor(`document.querySelector('#claim-title')`);
  await page.click('Keep a local draft of this bill on this device').catch(async () => { await page.eval(`[...document.querySelectorAll('label.check')].find(l=>l.innerText.includes('local draft')).querySelector('input').click()`); });
  await sleep(150);
  check('blocked storage: app works, failure explained', (await page.text()).includes('Saving failed; this session still works in memory.'));

  check('no runtime errors', page.errors.length === 0, page.errors.join(' | '));
} catch (e) {
  console.log('ABORT', e.stack);
  await page.shot(`${S}/abort.png`, true);
} finally {
  writeFileSync(`${S}/interactions.json`, JSON.stringify(results, null, 1));
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} passed`);
  await page.close();
}
