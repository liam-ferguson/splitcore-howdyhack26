# Browser checks (development evidence)

These scripts drive the locally installed Google Chrome over the DevTools Protocol, using Node's built-in WebSocket. They need no npm packages. Run them against the production preview, `npm run preview -- --host 127.0.0.1` on port 4173. Output (screenshots, logs) goes to `./out`.

| Script | What it checks |
|---|---|
| `flowA.mjs [text\|image] [w] [h]` | Fixture A end to end: claims, $33.54 paid, $5 marked as extra tip, Settle totals |
| `ocr-evidence.mjs` | Uploads each fixture PNG through the real file input and prints the recognized text plus parsed fields |
| `interactions.mjs` | 51 acceptance checks: discrepancy, reconfirmation, payer change, invalidation, clipboard and fallback, demo QR text, Points Rescue dialog, PayPal string, lookalike link, cancel/reset during OCR, bad inputs, keyboard, storage. Run `python -I make-bad-inputs.py` first. |
| `visual.mjs` | 390×844, 320 px, 640 px (200% zoom of 1280), 1440×900: horizontal overflow, chip size, dock clearance, reduced motion |
| `network.mjs` | Every page and Web Worker request during a real scan |
| `decode.mjs <png>` | Independent QR decode of a screenshot with jsQR. jsQR is installed outside the project (see the file header). |

Chrome's path is set in `cdp.mjs`. These are not part of `npm test`.
