// Check every rewards URL in the directory: plain fetch first, then a real Chrome render for
// sites whose bot protection blocks plain requests. Public pages only; never signs in.
import { DIRECTORY } from '../../src/domain/rewards.js';
import { launch, sleep } from './cdp.mjs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const urls = [...new Set(DIRECTORY.flatMap(e => [e.url, ...(e.claim?.links ?? []).map(l => l.href)]))];
const results = {};
await Promise.all(urls.map(async u => {
  try {
    const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': UA, accept: 'text/html' } });
    results[u] = { status: r.status, final: r.url };
  } catch (e) { results[u] = { status: 'ERR', final: '' }; }
}));
const needRender = urls.filter(u => results[u].status !== 200);
if (needRender.length) {
  const page = await launch({ width: 1280, height: 900, port: 9970, args: [`--user-agent=${UA}`] });
  try {
    for (const u of needRender) {
      await page.send('Page.navigate', { url: u });
      await sleep(8000);
      const info = await page.eval(`const t=document.title+' '+(document.body?.innerText||'').slice(0,4000); return { url: location.href, blocked: /just a moment|attention required|access denied|security checkpoint/i.test(t), notFound: /page not found|404|nothing to see/i.test(t), reward: /reward|club|points|perks|royalty|mypanera|one/i.test(t) }`);
      results[u] = { ...results[u], rendered: info.blocked ? 'BLOCKED' : info.notFound ? 'NOT FOUND' : info.reward ? 'OK' : 'UNCLEAR', final: info.url };
    }
  } finally { await page.close(); }
}
let bad = 0;
for (const u of urls) {
  const r = results[u];
  const ok = r.status === 200 || r.rendered === 'OK';
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'BAD'} ${r.status}${r.rendered ? `/${r.rendered}` : ''} ${u}${r.final && r.final !== u ? ` -> ${r.final}` : ''}`);
}
console.log(`\n${urls.length - bad}/${urls.length} rewards links load (checked ${new Date().toLocaleDateString('en-CA')} local time)`);
