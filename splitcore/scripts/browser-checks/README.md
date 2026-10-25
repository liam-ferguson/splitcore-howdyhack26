# Browser checks (development evidence)

These scripts drive the locally installed Google Chrome over the DevTools Protocol, using Node's built-in WebSocket. They need no npm packages. Run them against the production preview, `npm run preview -- --host 127.0.0.1` on port 4173. Output (screenshots, logs) goes to `./out`.

| Script | What it checks |
|---|---|
| `interactions.mjs` | 67 acceptance checks: discrepancy and reconfirmation, payer change, people dialog, invalidation, the **pizza-vs-Chick-fil-A regression and Undo**, rewards detection, picker and join links, clipboard and fallback, demo QR, PayPal string, lookalike link, cancel/reset during OCR, bad inputs, keyboard, storage. Run `python -I make-bad-inputs.py` first. |
| `visual.mjs` | 390×844, 320 px, 640 px (200% zoom of 1280), 1440×900: horizontal overflow, chip size, dock clearance, reduced motion |
| `tour.mjs [w] [h]` | Screenshots of every major screen and dialog for visual review |
| `overflow.mjs [w]` | Lists any element wider than the viewport, or than its parent |
| `ocr-evidence.mjs` | Uploads each fixture PNG through the real file input and prints the recognized text plus parsed fields |
| `flowA.mjs [text\|image] [w] [h]` | Fixture A end to end |
| `network.mjs` | Every page and Web Worker request during a real scan |
| `offline-model.mjs` | OCR CDN blocked → recovery choices, and paste still works |
| `source-view.mjs` | Receipt-source line highlighting |
| `focus-probe.mjs` | Where keyboard focus lands after entering demo mode |
| `rewards-links.mjs` | Every rewards URL in the directory loads (plain fetch, then a Chrome render for bot-protected sites). Public pages only. |
| `decode.mjs <png>` | Independent QR decode with jsQR, installed outside the project (see the file header; set `JSQR` to its path) |

Chrome's path is set in `cdp.mjs`. These are not part of `npm test`.
