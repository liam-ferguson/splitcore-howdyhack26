// Minimal Chrome DevTools Protocol driver (no dependencies; Node 22+ WebSocket).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ width = 390, height = 844, port = 9333, mobile = false, args = [] } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'sc-profile-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', `--window-size=${width},${height}`, ...args, 'about:blank'], { stdio: 'ignore' });
  let info;
  for (let i = 0; i < 50; i++) {
    try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); }
  }
  const browser = await connect(info.webSocketDebuggerUrl);
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const t = list.find(x => x.id === targetId);
  const page = await connect(t.webSocketDebuggerUrl);
  page.browser = browser;
  page.proc = proc;
  page.errors = [];
  page.console = [];
  page.requests = [];
  page.on('Runtime.exceptionThrown', p => page.errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
  page.on('Runtime.consoleAPICalled', p => page.console.push(`${p.type}: ${p.args.map(a => a.value ?? a.description).join(' ')}`));
  page.on('Log.entryAdded', p => { if (p.entry.level === 'error') page.errors.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`); });
  page.on('Network.requestWillBeSent', p => page.requests.push({ url: p.request.url, method: p.request.method, postData: p.request.hasPostData }));
  await page.send('Runtime.enable'); await page.send('Log.enable'); await page.send('Network.enable'); await page.send('Page.enable'); await page.send('DOM.enable');
  await page.viewport(width, height, mobile);
  page.close = async () => { try { await browser.send('Browser.close'); } catch {} proc.kill(); };
  return page;
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const handlers = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(`${m.error.message} ${m.error.data ?? ''}`)) : res(m.result);
    } else if (m.method) (handlers.get(m.method) ?? []).forEach(h => h(m.params));
  };
  const api = {
    send: (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); }),
    on: (method, h) => { handlers.set(method, [...(handlers.get(method) ?? []), h]); },
  };
  api.viewport = (width, height, mobile = false) => api.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  api.goto = async url => { await api.send('Page.navigate', { url }); await sleep(300); await api.waitFor('document.readyState === "complete"'); await sleep(300); };
  api.eval = async (expr) => {
    const r = await api.send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  api.waitFor = async (cond, timeout = 10000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const r = await api.send('Runtime.evaluate', { expression: `!!(${cond})`, returnByValue: true });
      if (r.result?.value) return true;
      await sleep(100);
    }
    throw new Error(`timeout waiting for ${cond}`);
  };
  // Click the first button/link/summary whose visible text includes `text` (optionally inside a selector scope).
  api.click = async (text, scope = 'document') => {
    const ok = await api.eval(`
      const root = ${scope === 'document' ? 'document' : `document.querySelector(${JSON.stringify(scope)})`};
      const els = [...root.querySelectorAll('button, a, summary, [role=button]')].filter(e => e.offsetParent !== null || e.tagName === 'SUMMARY');
      const norm = s => (s || '').replace(/\\s+/g,' ').trim();
      const el = els.find(e => norm(e.getAttribute('aria-label')).includes(${JSON.stringify(text)})) || els.find(e => norm(e.innerText).includes(${JSON.stringify(text)}));
      if (!el) return false;
      if (el.disabled) return 'disabled';
      el.scrollIntoView({block:'center'}); el.click(); return true;`);
    if (ok !== true) throw new Error(`click "${text}": ${ok}`);
    await sleep(120);
  };
  // Physical-style click through Input domain on a selector (exercises real hit testing).
  api.tap = async (selector) => {
    const box = await api.eval(`const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};`);
    if (!box) throw new Error(`tap: no ${selector}`);
    for (const type of ['mousePressed', 'mouseReleased']) await api.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await sleep(120);
  };
  api.type = async (selector, text) => {
    await api.eval(`const e=document.querySelector(${JSON.stringify(selector)}); e.focus(); e.select?.();`);
    await api.send('Input.insertText', { text });
    await sleep(80);
  };
  api.clear = async (selector) => {
    await api.eval(`const e=document.querySelector(${JSON.stringify(selector)}); e.focus(); e.select?.();`);
    await api.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await api.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await sleep(50);
  };
  api.key = async (key, code = key, vk = 0, modifiers = 0) => {
    await api.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers });
    await api.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
    await sleep(60);
  };
  api.setFile = async (selector, path) => {
    const { root } = await api.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await api.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    await api.send('DOM.setFileInputFiles', { nodeId, files: [path] });
  };
  api.shot = async (path, full = false) => {
    let clip;
    if (full) {
      const m = await api.send('Page.getLayoutMetrics');
      clip = { x: 0, y: 0, width: m.cssContentSize.width, height: m.cssContentSize.height, scale: 1 };
    }
    const r = await api.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) });
    writeFileSync(path, Buffer.from(r.data, 'base64'));
  };
  api.text = () => api.eval('return document.body.innerText');
  return api;
}

export { sleep };
