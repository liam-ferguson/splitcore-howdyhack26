// Render the exact fixture text to black-on-white PNGs with the locally installed
// Chrome (headless screenshot). Precise test data, not generated artwork.
// Usage: node scripts/make-fixtures.mjs [path-to-chrome]

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SAMPLE_A, SAMPLE_B, SAMPLE_C } from '../src/demo/receipts.js';

const candidates = [
  process.argv[2],
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chrome = candidates.find(p => existsSync(p));
if (!chrome) throw new Error('No Chrome/Edge found; pass its path as an argument.');

const root = resolve(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'splitcore-fixtures-'));
const FONT = 32, LINE = 46, PAD = 64, WIDTH = 1000;

function render(text, out) {
  const lines = text.split('\n');
  const height = PAD * 2 + lines.length * LINE;
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:#fff}
    pre{margin:0;padding:${PAD}px;font:${FONT}px/${LINE}px Consolas,"Courier New",monospace;color:#000;white-space:pre}
  </style><pre>${esc}</pre>`;
  const file = join(work, 'page.html');
  writeFileSync(file, html);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${WIDTH},${height}`, `--screenshot=${out}`, pathToFileURL(file).href], { stdio: 'ignore' });
  console.log(`wrote ${out} (${WIDTH}x${height})`);
}

mkdirSync(join(root, 'public/demo'), { recursive: true });
mkdirSync(join(root, 'fixtures'), { recursive: true });
render(SAMPLE_A, join(root, 'public/demo/sample-a.png'));
render(SAMPLE_B, join(root, 'public/demo/sample-b.png'));
render(SAMPLE_C, join(root, 'public/demo/sample-c.png'));
// QA variants (not shipped in the app): changed price, and a renamed copy of A.
render(SAMPLE_C.replaceAll('10.01', '10.02'), join(root, 'fixtures/penny-diner-changed.png'));
copyFileSync(join(root, 'public/demo/sample-a.png'), join(root, 'fixtures/renamed-receipt-photo.png'));
render(SAMPLE_A.replace('SALES TAX                    2.08', 'SALES TAX                    1.08'), join(root, 'fixtures/sample-a-tax-typo.png'));
