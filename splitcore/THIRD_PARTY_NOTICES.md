# Third-party notices

SplitCore's own source (UI, receipt parser, allocation engine, request builder, rewards directory text, icons and brand mark) is original work created for HowdyHack 2026 with Claude Code assistance. It uses the third-party components below. Full license texts ship with each package in `node_modules/<name>/` (LICENSE / LICENSE.md) after `npm ci`.

## Bundled into the built app

| Component | Version | License | Notes |
|---|---|---|---|
| react | 19.3.1 | MIT | © Meta Platforms, Inc. and affiliates |
| react-dom | 19.3.1 | MIT | © Meta Platforms, Inc. and affiliates |
| scheduler | 0.28.0 | MIT | react-dom dependency |
| tesseract.js | 6.0.1 | Apache-2.0 | Browser OCR wrapper. Not modified. |
| qrcode | 1.5.4 | MIT | © Ryan Day. Client-side QR generation |
| dijkstrajs | 1.0.3 | MIT | qrcode dependency |
| pngjs | 5.0.0 | MIT | qrcode dependency (Node path) |
| bmp-js, idb-keyval, is-url, regenerator-runtime, wasm-feature-detect, zlibjs | see lockfile | MIT / Apache-2.0 | tesseract.js dependencies |

`npm ls --omit=dev --all` also lists Node-only transitive packages of `qrcode` (yargs and its MIT/ISC dependencies) and `tesseract.js` (node-fetch, whatwg-url, tr46, webidl-conversions [BSD-2-Clause], opencollective-postinstall). They are installed but are not used by the browser build.

## Downloaded at runtime by the browser (not redistributed in this repository)

On the first scan, tesseract.js 6.0.1 fetches these public assets from cdn.jsdelivr.net using its default paths:

| Asset | License |
|---|---|
| `tesseract.js@v6.0.1/dist/worker.min.js` | Apache-2.0 |
| `tesseract.js-core@v6.0.0` WebAssembly build (Tesseract OCR engine and the libraries it bundles) | Apache-2.0, with upstream notices in the core package's LICENSE |
| `@tesseract.js-data/eng` `4.0.0_best_int/eng.traineddata.gz` (pretrained English LSTM model from the Tesseract project) | Apache-2.0 (upstream tessdata); the npm wrapper package states MIT |

Inference happens locally in a Web Worker. No receipt image or text is sent anywhere.

## Font

**Inter 4.1** (`public/fonts/InterVariable.woff2`), © The Inter Project Authors, licensed under the SIL Open Font License 1.1. The full license is in `public/fonts/OFL.txt` and is served with the app.

## Development only

| Tool | Version | License |
|---|---|---|
| vite | 8.3.5 | MIT |
| Node.js built-in `node:test` / `node:assert` | runtime | Node.js license |

## Trademarks

Chick-fil-A, McDonald's, Wendy's, PayPal, Venmo and Cash App are trademarks of their owners. SplitCore uses their names only to describe compatibility and to link to their public pages. It includes no logos and has no affiliation, endorsement or integration with them.
