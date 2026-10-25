import { fileURLToPath } from 'node:url';
// Record every request from the page AND its Web Workers during a real OCR scan.
import { launch } from './cdp.mjs';
const page = await launch({ width: 1440, height: 900, port: 9500 });
const reqs = [];
page.on('Network.requestWillBeSent', p => reqs.push({ src: 'page', method: p.request.method, url: p.request.url, post: !!p.request.hasPostData }));
page.on('Target.attachedToTarget', async p => {
  const sid = p.sessionId;
  await page.send('Network.enable', {}, sid).catch(() => {});
  await page.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {});
  reqs.push({ src: 'attach', url: `${p.targetInfo.type} ${p.targetInfo.url.slice(0, 60)}` });
});
// Worker network events arrive with a sessionId; the shared handler records them too.
await page.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
try {
  await page.goto('http://127.0.0.1:4173/');
  await page.setFile('input[type=file][accept^="image/png"]', fileURLToPath(new URL('../../public/demo/sample-a.png', import.meta.url)));
  await page.waitFor(`document.querySelector('#claim-title')`, 90000);
  const ext = reqs.filter(r => r.url && !/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(r.url) && r.src !== 'attach');
  console.log('attached:', reqs.filter(r => r.src === 'attach').map(r => r.url));
  console.log('external requests:'); for (const r of ext) console.log(` ${r.method} ${r.url} post=${r.post}`);
  console.log('any POST/PUT anywhere:', reqs.filter(r => r.method && r.method !== 'GET').map(r => `${r.method} ${r.url}`));
} finally { await page.close(); }
