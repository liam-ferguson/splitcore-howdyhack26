// Where does keyboard focus land after entering demo mode? (Regression probe.)
import { launch, sleep } from './cdp.mjs';
const page = await launch({ width: 1440, height: 900, port: 9960 });
try {
  await page.goto('http://127.0.0.1:4173/');
  const before = await page.eval(`return document.activeElement?.className || document.activeElement?.tagName`);
  await page.eval(`const b=[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Try a sample')); b.focus(); b.click();`);
  await sleep(600);
  console.log('before:', before, '| after Try a sample:', await page.eval(`const a=document.activeElement; return (a?.id||'') + ' ' + (a?.className||a?.tagName) + ' ' + (a?.innerText||'').slice(0,40)`));
} finally { await page.close(); }
