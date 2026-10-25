// Model/worker download failure: block the CDN and confirm the scan fails into recovery choices.
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
const img = fileURLToPath(new URL('../../public/demo/sample-a.png', import.meta.url));
const page = await launch({ width: 1440, height: 900, port: 9700, args: ['--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1:9'] });
try {
  await page.goto('http://127.0.0.1:4173/');
  const t0 = Date.now();
  await page.setFile('input[type=file][accept^="image/png"]', img);
  await page.waitFor(`document.querySelector('[role=alert]') || document.querySelector('#claim-title')`, 70000);
  const msg = await page.eval(`return document.querySelector('[role=alert]')?.innerText.split(String.fromCharCode(10)).join(" ") ?? 'CLAIM'`);
  console.log(`${msg.startsWith("Couldn't read this receipt") ? 'PASS' : 'FAIL'} blocked model download → recovery after ${Date.now() - t0} ms: ${msg}`);
  // Paste fallback still works in the same session
  await page.click('Paste receipt text');
  await page.type('#paste-text', 'TAPAS 7.01\nTOTAL 7.01');
  await page.click('Read text');
  await page.waitFor(`document.querySelector('#claim-title')`);
  console.log('PASS paste fallback works while OCR unavailable');
  console.log('page errors:', page.errors);
} finally { await page.close(); }
