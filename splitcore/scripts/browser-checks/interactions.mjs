// End-to-end acceptance checks against the production preview (http://127.0.0.1:4173).
// Run `python -I make-bad-inputs.py` first. Results also go to out/interactions.json.
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const S = process.env.OUT ?? fileURLToPath(new URL('./out', import.meta.url));
mkdirSync(S, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const page = await launch({ width: 1440, height: 900 });
const txt = sel => page.eval(`return document.querySelector(${JSON.stringify(sel)})?.innerText ?? null`);
const cents = sel => page.eval(`return [...document.querySelectorAll(${JSON.stringify(sel)})].map(e => Number(e.dataset.cents))`);
const chip = async (unit, name) => {
  const ok = await page.eval(`const g=[...document.querySelectorAll('[role=group]')].find(g=>g.getAttribute('aria-label')==='Who had ${unit}'); if(!g) return false; const b=[...g.querySelectorAll('button')].find(b=>b.innerText.includes('${name}')); if(!b) return false; b.click(); return true;`);
  if (!ok) throw new Error(`chip ${unit}/${name} not found`);
  await sleep(40);
};
async function claimA() {
  await chip('SANDWICH 1 of 2', 'Maya'); await chip('SANDWICH 2 of 2', 'Jordan'); await chip('NUGGETS', 'Sam');
  await page.click('Share FRIES with everyone'); await chip('DRINK 1 of 2', 'Maya'); await chip('DRINK 2 of 2', 'Sam');
}
async function sampleText(i) {
  await page.eval(`[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Use sample text'))[${i}].click()`);
  await page.waitFor(`document.querySelector('#claim-title')`);
  await sleep(150);
}
async function demoA() {
  await page.goto('http://127.0.0.1:4173/');
  await page.click('Try a sample');
  await sampleText(0);
}
const reviewEnabled = () => page.eval(`return !document.querySelector('.summary .btn-primary').disabled`);
const payTo = async name => { await page.eval(`[...document.querySelectorAll('.payer-option')].find(l=>l.innerText.trim()===${JSON.stringify(name)}).querySelector('input').click()`); await sleep(80); };
const summaryCents = () => cents('.summary-list .money');

try {
  // 1. Discrepancy + reconfirmation
  await demoA();
  await claimA();
  await page.type('#f-paid', '33.54'); await page.click('The extra $5.00 was tip'); await page.click('Confirm $33.54 paid');
  check('ready after claims + paid', await reviewEnabled());
  check('summary shows exact shares', JSON.stringify(await summaryCents()) === '[1102,911,1341]', JSON.stringify(await summaryCents()));
  await page.click('Edit bill');
  await page.type('#f-taxCents', '1.08');
  await sleep(100);
  check('tax 2.08→1.08 shows $1 discrepancy', (await txt('.corecheck')).includes('Items and charges are $1.00 below the receipt total. Review the highlighted lines.'));
  check('settlement disabled on discrepancy', !(await reviewEnabled()));
  check('paid confirmation cleared by money edit', !(await page.eval(`return !!document.querySelector('.paid .status-ok')`)));
  check('settle step disabled', await page.eval(`return [...document.querySelectorAll('.step')].find(b=>b.innerText.includes('Settle')).disabled`));
  await page.click('Review', '.corecheck');
  await sleep(250);
  check('Review focuses a correction field', (await page.eval(`return document.activeElement?.id`)) === 'f-taxCents');
  await page.type('#f-taxCents', '2.08'); await sleep(100);
  check('fix restores Amounts match', (await txt('.corecheck')).includes('Amounts match'));
  check('still requires reconfirmation', !(await reviewEnabled()));
  await page.click('Confirm $33.54 paid');
  check('ready again after reconfirm', await reviewEnabled());

  // 2. Unclassified extra blocked; classification only once
  await page.clear('#f-paid'); await page.type('#f-paid', '38.54'); await sleep(100);
  const paidTxt = await txt('.paid');
  check('raising paid is blocked with a classification choice', paidTxt.includes('You paid $10.00 more') && !(await reviewEnabled()));
  await page.clear('#f-paid'); await page.type('#f-paid', '33.54'); await sleep(100);
  await page.click('Confirm $33.54 paid');
  check('extra tip stays $5 (no duplication)', (await txt('.paid')).includes('$5.00'));
  check('money input shows full amount, not hidden under $', await page.eval(`const i=document.getElementById('f-paid'); return parseFloat(getComputedStyle(i).paddingLeft) >= 28`));

  // 3. Settle; change payer to Sam
  await page.click('Review split'); await sleep(400);
  check('settle headline exact', JSON.stringify(await cents('#settle-title .money')) === '[2252]');
  check('settle secondary', (await txt('.settle-sub')) === 'Maya’s share $11.02 · Paid $33.54');
  check('no request card for payer', !(await page.eval(`return [...document.querySelectorAll('article.person:not(.payer-card) h2')].some(h=>h.innerText.includes('Maya'))`)));
  await page.click('Edit claims'); await sleep(200);
  await payTo('Sam');
  check('payer Sam: reimbursement $20.13', JSON.stringify(await cents('.summary-hero .money')) === '[2013]');
  check('payer Sam: shares unchanged', JSON.stringify(await summaryCents()) === '[1102,911,1341]');
  await payTo('Maya');

  // 4. Rename (person dialog) changes message not numbers
  await page.click('Jordan. Edit'); await sleep(200);
  await page.clear('#rename-input'); await page.type('#rename-input', 'Jordy'); await page.click('Save name'); await sleep(150);
  check('rename keeps amounts', (await txt('.summary-list')).includes('Jordy') && JSON.stringify(await summaryCents()) === '[1102,911,1341]');
  check('rename keeps paid confirmation', await reviewEnabled());
  await page.click('Maya, paid the bill. Edit'); await sleep(150);
  await page.clear('#rename-input'); await page.type('#rename-input', 'Sam'); await page.click('Save name'); await sleep(100);
  check('duplicate rename shows an error', (await page.text()).includes('Sam is already at the table.'));
  await page.key('Escape', 'Escape', 27); await sleep(150);

  // 5. Unclaim a drink: exact remaining unit, finalized output disappears
  await chip('DRINK 2 of 2', 'Sam'); await sleep(100);
  check('unclaim shows exact remaining unit', (await txt('.summary')).includes('Still unclaimed: DRINK 2 of 2'));
  check('final totals hidden while incomplete', !(await page.eval(`return !!document.querySelector('.summary-hero')`)));
  await chip('DRINK 2 of 2', 'Sam');

  // 6. Quantity edit invalidates only that line
  await page.click('Edit DRINK'); await sleep(100);
  const qid = await page.eval(`return document.querySelector('[id^=item-qty-]').id`);
  await page.clear('#' + qid); await page.type('#' + qid, '3'); await page.eval(`document.getElementById('${qid}').blur()`); await sleep(150);
  check('quantity edit notice', (await page.text()).includes('Quantity changed — claims for this line were cleared.'));
  const onChips = await page.eval(`return document.querySelectorAll('.chip-on').length`);
  check('other lines keep claims', onChips === 6, `${onChips} selected chips remain`);
  check('quantity edit clears paid confirmation', !(await reviewEnabled()));

  // 7. Remove diner restores units to unassigned
  await page.click('Sam. Edit'); await sleep(150);
  await page.click('Remove', 'dialog[open]'); await sleep(150);
  check('removing Sam unassigns NUGGETS', await page.eval(`return [...document.querySelectorAll('article.item')].find(a=>a.querySelector('.item-name').innerText==='NUGGETS').innerText.includes('Needs owner')`));

  // 8. Reported bug: a pizza receipt must never show Chick-fil-A; new receipts replace with Undo
  await demoA(); await claimA();
  await page.click('Snap', '.steps'); await sleep(200);
  check('Snap names the bill in progress', (await txt('.continue-bar')).includes('Chick-fil-A'));
  await sampleText(1);
  const pizzaText = await page.text();
  check('pizza receipt loads (no stale bill)', (await txt('.merchant-name')) === 'SPLITCORE CAFE');
  check('pizza receipt never mentions Chick-fil-A', !pizzaText.includes('Chick-fil-A'), pizzaText.includes('Chick-fil-A') ? 'found Chick-fil-A text' : '');
  check('no rewards program shown for unknown pizza place', (await page.text()).includes('No rewards program found for SPLITCORE CAFE'));
  check('claims cleared for the new receipt', (await page.eval(`return document.querySelectorAll('.chip-on').length`)) === 0);
  await page.click('Undo'); await sleep(250);
  check('Undo restores the previous bill with its claims', (await txt('.merchant-name')) === 'Chick-fil-A' && (await page.eval(`return document.querySelectorAll('.chip-on').length`)) === 8);
  await page.click('Snap', '.steps'); await sleep(150);
  await sampleText(1);
  await page.click('Choose a restaurant'); await sleep(200);
  await page.type('#picker-q', 'domino'); await sleep(100);
  await page.click('Domino’s', 'dialog[open]'); await sleep(200);
  const join = await page.eval(`return [...document.querySelectorAll('a')].find(a=>a.innerText.includes('Join Domino’s Rewards'))?.getAttribute('href')`);
  check('picker → Domino’s Rewards join link', join === 'https://www.dominos.com/my-deals-and-rewards', join);
  check('manual choice says so', (await page.text()).includes('You chose this restaurant'));
  await page.click('Edit restaurant name'); await sleep(100);
  await page.clear('#f-merchant'); await page.type('#f-merchant', 'Pizza Hut #4421'); await page.click('Save', '.receipt-head'); await sleep(200);
  check('editing merchant re-detects (Pizza Hut → Hut Rewards)', (await txt('.rewards-spot')).includes('Hut Rewards'));
  await page.click('Not Pizza Hut?'); await sleep(150); await page.click('None of these'); await sleep(150);
  check('“None of these” turns rewards off', (await page.text()).includes('Rewards lookup turned off for this bill.'));

  // 9. Settle request contents, clipboard, QR decode
  await demoA(); await page.click('Reset demo'); await sampleText(0);
  const cfaJoin = await page.eval(`return [...document.querySelectorAll('.rewards-spot a')].map(a=>a.getAttribute('href'))`);
  check('Chick-fil-A detected automatically with official join link', JSON.stringify(cfaJoin) === '["https://www.chick-fil-a.com/one"]', JSON.stringify(cfaJoin));
  await claimA();
  await page.type('#f-paid', '33.54'); await page.click('The extra $5.00 was tip'); await page.click('Confirm $33.54 paid');
  await page.click('Review split'); await sleep(500);
  await page.browser.send('Browser.grantPermissions', { origin: 'http://127.0.0.1:4173', permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await page.click('Copy reminder'); await sleep(300);
  const clip = (await page.eval(`return await navigator.clipboard.readText()`)).split(String.fromCharCode(13)).join('');
  check('copied reminder text (Jordan)', clip.startsWith('DEMO — sample only; no payment requested.\nHey Jordan! Your share at Chick-fil-A is $9.11.') && clip.includes('extra tip $1.36'), JSON.stringify(clip));
  check('copy success shown after write', (await page.text()).includes('Copied'));
  await page.browser.send('Browser.resetPermissions', {});
  await page.eval(`navigator.clipboard.writeText = () => Promise.reject(new DOMException('denied','NotAllowedError'))`);
  await sleep(2800); await page.click('Copy reminder'); await sleep(250);
  check('clipboard denied → selectable fallback', await page.eval(`const t=document.querySelector('.copy-fallback textarea'); return !!t && t.value.includes('Hey Jordan') && document.activeElement===t`));
  check('demo has no financial links', !(await page.eval(`return [...document.querySelectorAll('a')].some(a=>/paypal|venmo|cash\\.app/.test(a.href))`)));
  // Real clicks focus the button; a scripted .click() does not, so focus it first like a user would.
  await page.eval(`const b=[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Demo QR')); b.focus(); b.click();`); await sleep(700);
  const payload =await page.eval(`return document.querySelector('dialog[open] .payload code').innerText`);
  check('demo payload exact', payload === 'SPLITCORE DEMO | No payment | Jordan | USD 9.11 | Food 6.84 + tax 0.57 + service 0.34 + extra tip 1.36 | Sample only', payload);
  const box = await page.eval(`const i=document.querySelector('dialog[open] .qr img'); const r=i.getBoundingClientRect(); return {x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height}`);
  const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: box.x - 10, y: box.y - 10, width: box.w + 20, height: box.h + 20, scale: 2 } });
  writeFileSync(`${S}/qr-jordan.png`, Buffer.from(shot.data, 'base64'));
  await page.key('Escape', 'Escape', 27); await sleep(200);
  check('QR dialog returns focus to its button', (await page.eval(`return document.activeElement?.innerText`))?.includes('Demo QR'));
  await page.click('Edit claims'); await sleep(150);
  await chip('NUGGETS', 'Sam'); await chip('NUGGETS', 'Jordan'); await page.click('Review split'); await sleep(400);
  await page.click('Demo QR'); await sleep(500);
  const p2 = await page.eval(`return document.querySelector('dialog[open] .payload code').innerText`);
  check('QR payload updates after assignment edit', p2.includes('Jordan | USD 18.') && !p2.includes('9.11'), p2);
  await page.key('Escape', 'Escape', 27);
  await page.click('Edit claims'); await chip('NUGGETS', 'Jordan'); await chip('NUGGETS', 'Sam'); await page.click('Review split'); await sleep(300);

  // 10. Rewards dialog (missed visit)
  await page.click('Add this visit'); await sleep(300);
  const dlg = await page.eval(`return document.querySelector('dialog[open]')?.innerText`);
  check('rewards dialog shows sample warning', dlg.includes('Sample only — do not submit this receipt.'));
  check('rewards details use receipt total, not paid', dlg.includes('$28.54') && !dlg.includes('$33.54'));
  check('rewards dialog has join + verified date', dlg.includes('Join or sign in to Chick-fil-A One') && dlg.includes('Link checked October 24, 2026'));
  const links = await page.eval(`return [...document.querySelectorAll('dialog[open] a')].map(a=>a.href+' '+a.rel+' '+a.target)`);
  check('official links open safely', links.length === 3 && links.every(l => l.includes('noopener noreferrer _blank')), links.join(' | '));
  await page.key('Escape', 'Escape', 27); await sleep(200);
  check('Escape closes dialog', !(await page.eval(`return !!document.querySelector('dialog[open]')`)));
  check('focus returns to opener', (await page.eval(`return document.activeElement?.innerText`))?.includes('Add this visit'));

  // 11. Real mode: pasted receipt, PayPal string (not opened), lookalike rejection
  await page.goto('http://127.0.0.1:4173/');
  await page.click('Paste receipt text');
  await page.type('#paste-text', 'TAPAS 7.01\nTOTAL 7.01');
  await page.click('Read text'); await page.waitFor(`document.querySelector('#claim-title')`);
  await page.type('#f-add-diner', 'Maya'); await page.click('Add person');
  await page.type('#f-add-diner', 'Jordan'); await page.click('Add person');
  await chip('TAPAS', 'Maya'); await chip('TAPAS', 'Jordan');
  await page.click('Same as receipt'); await page.click('Confirm $7.01 paid');
  check('novel pasted receipt totals', JSON.stringify(await summaryCents()) === '[351,350]');
  await page.click('Review split'); await sleep(300);
  await page.eval(`[...document.querySelectorAll('.seg')].find(l=>l.innerText.includes('PayPal')).querySelector('input').click()`); await sleep(100);
  await page.type('#f-pay-handle', 'SplitCoreExample'); await sleep(150);
  const href = await page.eval(`return [...document.querySelectorAll('a')].find(a=>a.href.includes('paypal.me'))?.getAttribute('href')`);
  check('real PayPal.Me amount link string', href === 'https://paypal.me/SplitCoreExample/3.50USD', href);
  await page.eval(`[...document.querySelectorAll('.seg')].find(l=>l.innerText.includes('Venmo')).querySelector('input').click()`); await sleep(100);
  await page.clear('#f-pay-handle'); await page.type('#f-pay-handle', 'maya-example');
  await page.type('#f-pay-url', 'https://venmo.com.evil.example/u/maya'); await sleep(150);
  check('lookalike Venmo link rejected with handle fallback', (await page.text()).includes('Pay to @maya-example') && !(await page.eval(`return [...document.querySelectorAll('a')].some(a=>a.href.includes('evil'))`)));

  // 12. Reset demo cancels pending OCR; cancel then new scan wins
  await page.goto('http://127.0.0.1:4173/');
  await page.click('Try a sample');
  await page.eval(`[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Scan sample image'))[1].click()`);
  await sleep(250);
  const scanning = await page.eval(`return !!document.querySelector('.scan-stage')`);
  await page.click('Reset demo'); await sleep(4000);
  check('reset during OCR cancels; stale result never lands', scanning && !(await page.eval(`return !!document.querySelector('#claim-title')`)) && !(await page.eval(`return !!document.querySelector('.scan-stage')`)));
  await page.eval(`[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Scan sample image'))[1].click()`);
  await sleep(150);
  await page.click('Cancel scan'); await sleep(100);
  await page.eval(`[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Scan sample image'))[2].click()`);
  await page.waitFor(`document.querySelector('#claim-title')`, 60000); await sleep(1500);
  check('after cancel, new scan result wins', (await txt('.merchant-name')) === 'PENNY DINER');

  // 13. Bad inputs
  const inputSel = 'input[type=file][accept^="image/png"]';
  for (const [file, expect] of [
    [`${S}/bad.pdf`, 'PDFs are not supported'], [`${S}/bad.heic`, 'HEIC photos are not supported'],
    [`${S}/blank.png`, "Couldn't read this receipt"], [`${S}/big.png`, 'over 16 megapixels'], [`${S}/sideways.png`, null],
  ]) {
    await page.goto('http://127.0.0.1:4173/');
    await page.setFile(inputSel, file);
    await page.waitFor(`document.querySelector('[role=alert]') || document.querySelector('#claim-title')`, 60000);
    const msg = await page.eval(`return document.querySelector('[role=alert]')?.innerText ?? ('CLAIM: ' + document.querySelector('.corecheck')?.innerText)`);
    const opts = await page.eval(`return document.querySelector('[role=alert]') ? [...document.querySelectorAll('[role=alert] button')].map(b=>b.innerText).join(', ') : ''`);
    if (expect) check(`bad input ${file.split(/[\\/]/).pop()} recovers`, msg.includes(expect) && opts.includes('Paste receipt text'), `${msg.split('\n')[0]} [${opts}]`);
    else console.log(`INFO sideways.png → ${msg.split('\n')[0]} [${opts}]`);
  }
  if (await page.eval(`return !!document.querySelector('[role=alert]')`)) {
    await page.click('Rotate 90° and scan');
    await page.waitFor(`document.querySelector('#claim-title') || document.querySelector('[role=alert]')`, 60000);
    await sleep(500);
    const after = await page.eval(`return document.querySelector('.corecheck')?.innerText ?? document.querySelector('[role=alert]')?.innerText`);
    check('sideways image recovers via rotate', /Amounts match/.test(after), after.split('\n').slice(0, 3).join(' '));
  }

  // 14. Keyboard: tab to a chip and toggle with Space
  await demoA();
  await page.eval(`document.querySelector('#f-add-diner').focus()`);
  let found = false;
  for (let i = 0; i < 60 && !found; i++) {
    await page.key('Tab', 'Tab', 9);
    found = await page.eval(`return document.activeElement?.classList.contains('chip')`);
  }
  await page.key(' ', 'Space', 32);
  await sleep(100);
  check('keyboard Tab + Space toggles a chip', found && (await page.eval(`return document.activeElement.getAttribute('aria-pressed')`)) === 'true');
  const outline = await page.eval(`return getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth`);
  check('visible focus outline', outline.startsWith('solid 3px'), outline);
  await page.eval(`document.querySelector('.payer-option input').focus()`);
  await page.key('ArrowRight', 'ArrowRight', 39); await sleep(100);
  check('payer radios work with arrow keys', (await page.eval(`return document.querySelector('.payer-option.is-on')?.innerText.trim()`)) === 'Jordan');

  // 15. Storage: corrupt draft + blocked storage
  await page.goto('http://127.0.0.1:4173/');
  await page.eval(`localStorage.setItem('splitcore:v1:prefs', '{"rememberDraft":true,"rememberNames":true}'); localStorage.setItem('splitcore:v1:draft','{not json'); localStorage.setItem('splitcore:v1:names','[1,2,"Riley"]');`);
  await page.goto('http://127.0.0.1:4173/');
  check('corrupt draft ignored without crash', (await page.text()).includes('One bill') && !(await page.text()).includes('Restore local draft'));
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError')}})` });
  await page.goto('http://127.0.0.1:4173/');
  await page.click('Paste receipt text'); await page.type('#paste-text', 'TAPAS 7.01\nTOTAL 7.01'); await page.click('Read text');
  await page.waitFor(`document.querySelector('#claim-title')`);
  await page.eval(`[...document.querySelectorAll('label.check')].find(l=>l.innerText.includes('local draft')).querySelector('input').click()`);
  await sleep(150);
  check('blocked storage: app works, failure explained', (await page.text()).includes('Saving failed; this session still works in memory.'));

  check('no runtime errors', page.errors.length === 0, page.errors.join(' | '));
} catch (e) {
  console.log('ABORT', e.stack);
  await page.shot(`${S}/abort.png`, true);
  results.push({ name: 'script completed', ok: false, detail: e.message });
} finally {
  writeFileSync(`${S}/interactions.json`, JSON.stringify(results, null, 1));
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} passed`);
  await page.close();
}
