# SplitCore — Verification log

Date: **October 24, 2026** (America/Chicago). Build session: about 21:48–22:30 CDT, roughly 40 minutes of implementation plus verification.
Environment: Windows 11 Pro 10.0.26200, Node **24.22.1**, npm 11.19.1, Google Chrome **156.0.8078.47**, run headless and driven over the DevTools Protocol by `scripts/browser-checks/`. No physical phone was used.

## Status labels

- **Automated pass**: `npm test` (Node built-in test runner)
- **Browser observed**: scripted Chrome checks against the production preview (`vite preview`, http://127.0.0.1:4173), with screenshots reviewed
- **Documentation only**: checked against provider documentation; no live run
- **Pending**: needs a physical device, a real account or a human
- **Failed / known limitation**

## Installed versions (from the lockfile)

| Package | Planned | Installed |
|---|---|---|
| react / react-dom | 19.3.1 | 19.3.1 |
| vite (dev) | 8.3.5 | 8.3.5 |
| tesseract.js | 6.0.1 | 6.0.1 |
| tesseract.js-core | resolved by v6 | 6.1.2 in node_modules. At runtime tesseract.js 6.0.1's default `corePath` loads **tesseract.js-core@v6.0.0** from cdn.jsdelivr.net. |
| English model | default | `@tesseract.js-data/eng` `4.0.0_best_int` from cdn.jsdelivr.net |
| qrcode | 1.5.4 | 1.5.4 |
| Inter | 4.1 | 4.1 `InterVariable.woff2`, self-hosted, OFL-1.1 |

All planned versions resolved exactly, with no substitutions. A clean `npm ci` → `npm test` → `npm run build` in a fresh copy passed.

## Automated pass — `npm test`: 50 tests, 0 failures

- **money**:
  - `parseCents` accepts and rejects inputs as specified.
  - The allocator gives 1001 split three ways as 334/334/333, and 1 split three ways as 1/0/0.
  - Zero totals, zero weights and missing basis behave as specified; ties follow stable order.
  - Fixture A's tax, service and tip buckets match.
  - A 600-case loop checks conservation and floor/ceiling bounds.
- **receipt**:
  - Fixtures A, B and C parse field for field.
  - CRLF, NBSP and Unicode minus are normalized.
  - All five quantity forms parse; an `@` price mismatch creates an issue.
  - SUBTOTAL is never read as TOTAL; gross, net and unresolved subtotals behave as specified.
  - Duplicate and conflicting totals and tax lines are flagged.
  - Excluded lines are ignored: tender, change, card, auth, tax rate, suggested tip, metadata.
  - Uncertain lines (unlabeled negative, `4.8`, `500`, multi-column, `TOTAL 2854`) become issues, and no balancing charge is added.
  - Discount scope rules hold, including a deleted target staying blocking, item discount > line rejected, and discount > food rejected.
  - Printed TIP versus extra tip and paid states behave as specified.
  - `parseReceipt.length === 1`: no filename or mode argument.
- **split / state**:
  - Fixture A table exact: **11.02 / 9.11 / 13.41**, reimbursement **22.52**.
  - Payer changed to Sam → reimbursement **20.13**.
  - Fixture B exact: **9.24 / 9.23 / 11.54**, reimbursement **20.77**; one owner of both pizzas gets the full $4 item discount.
  - Fixture C: **3.34 / 3.34 / 3.33**, reimbursement 6.67. The $10.02 variant gives 3.34 × 3. TAPAS 7.01 gives 3.51 / 3.50.
  - Penny ties follow creation order, not display order.
  - Assignment variants work: toggle, only one, share all (new diners not auto-added), clear, remove diner.
  - A quantity edit clears only that line.
  - Provisional food is shown while incomplete; paid below the receipt blocks.
  - Printed tip plus extra tip increment, the zero basis with explicit equal split, and a no-food diner getting $0 all behave as specified.
  - 200 generated, financially valid bills conserve every cent.
  - Sanitized drafts round-trip without IDs, date, raw text or payment, and require reconfirmation. Corrupt or old drafts are rejected.
  - Demo and real bills stay separate.
- **requests / rewards**:
  - PayPal.Me gives `https://paypal.me/SplitCoreExample/9.11USD`, `/0.01USD` and `/10.00USD`; zero gives no link.
  - Handle and URL normalization reject http, userinfo, port, lookalike suffix, `javascript:`, `data:`, bad encoding and the wrong provider.
  - Venmo and Cash App never get amounts added.
  - The exact reminder text is checked.
  - Demo never returns an active link, and the demo payload is exact.
  - Merchant matching handles `Wendy burger` → none.
  - The rewards detail pack uses $28.54, never $33.54, and starts with DO NOT SUBMIT.

## Browser observed — production preview

### Real OCR (Tesseract.js in a Web Worker, real image bytes)

Uploaded through the real "Choose image" file input (`ocr-evidence.mjs`). Every item name, quantity, line amount, discount, subtotal, tax, service, total, merchant, date, time, store and order number matched the fixture text. Raw OCR output is saved in `scripts/browser-checks/out/ocr-evidence.txt` when the script is re-run.

| Image | Result | Wall time (incl. page load) |
|---|---|---|
| `public/demo/sample-a.png` | All fields correct, Amounts match | 1.5–2.1 s |
| `public/demo/sample-b.png` | All fields correct; PIZZA DISCOUNT → PIZZA only | 0.8–1.5 s |
| `public/demo/sample-c.png` | Correct, $10.01 | 0.8 s |
| `fixtures/penny-diner-changed.png` (prices changed to 10.02) | **$10.02** read; result follows the image | 0.6 s |
| `fixtures/renamed-receipt-photo.png` (copy of A, renamed) | Same as A, so the filename has no effect | 1.0–1.2 s |
| `fixtures/sample-a-tax-typo.png` (tax printed 1.08) | "Items and charges are $1.00 below the receipt total. Review the highlighted lines." | 1.1–1.6 s |

Times are from this fast desktop and network and are not a speed claim. The demo "Scan sample image" button sends the same PNG bytes through the same `scanImage` → `parseReceipt` path: A took 2.1 s through the UI, with real stage messages (Loading OCR engine → Loading English model → Starting recognizer → Reading text with real progress).

### Flow and interaction checks (`interactions.mjs`: 51/51 pass; `flowA.mjs`; `offline-model.mjs`; `source-view.mjs`)

- **Fixture A, end to end at 390×844 and 1440×900** (sample text and real OCR):
  - Maya, Jordan and Sam claim units as in the playbook; progress reads "6 of 6 units claimed".
  - Entering $33.54 shows "You paid $5.00 more than the $28.54 receipt total", with the button "The extra $5.00 was tip", then "Confirm $33.54 paid".
  - Settle shows "**$22.52 to get back**" and "Maya's share $11.02 · Paid $33.54". There are cards for Jordan ($9.11) and Sam ($13.41) and no request to Maya.
- **Discrepancy**:
  - Tax 2.08 → 1.08 shows the $1.00 warning, disables settlement and the Settle step, and clears paid confirmation.
  - "Review" focuses the tax field.
  - Correcting it restores "Amounts match", but settlement stays disabled until the paid amount is reconfirmed.
- **Paid amount**:
  - Raising paid by $5 without classifying it is blocked, with the classify choice shown.
  - Classifying does not duplicate the tip.
- **Payer and names**:
  - Changing the payer to Sam gives **$20.13**, with shares unchanged.
  - Renaming changes the name but not the amounts or paid confirmation.
- **Invalidation**:
  - Unclaiming a drink shows "Still unclaimed: DRINK 2 of 2" and hides final totals and requests.
  - A quantity edit shows the inline notice, keeps the other 6 claims, and clears paid confirmation.
  - Removing a diner returns their units to "Needs owner".
- **Copy**:
  - With clipboard permission, the copied text was read back: "DEMO — sample only; no payment requested. Hey Jordan! Your share at Chick-fil-A is $9.11 …"
  - "Copied" appears only after the write resolves.
  - With the write rejected, a focused, selected read-only textarea fallback appears.
- **Demo QR**:
  - Payload text is exact, and the page has no PayPal, Venmo or Cash App anchors in demo mode.
  - The **rendered QR was screenshotted and independently decoded with jsQR 1.4.0** to exactly `SPLITCORE DEMO | No payment | Jordan | USD 9.11 | Food 6.84 + tax 0.57 + service 0.34 + extra tip 1.36 | Sample only`.
  - After moving Nuggets to Jordan, the payloads update (Jordan USD 18.69, Sam USD 3.83), and no stale amount remains.
- **Points Rescue**:
  - Appears after "Confirm restaurant".
  - The dialog shows "Sample only — do not submit this receipt.", $28.54 (not $33.54), and "Policy checked October 24, 2026".
  - Links use `target=_blank rel="noopener noreferrer"`.
  - Escape closes the dialog and focus returns to "See how".
- **Real mode**:
  - Pasting `TAPAS 7.01 / TOTAL 7.01` and sharing between Maya and Jordan gives 3.51 / 3.50.
  - PayPal.Me `SplitCoreExample` builds the anchor `https://paypal.me/SplitCoreExample/3.50USD`. It was **not opened**.
  - A lookalike Venmo URL is rejected, and the "Pay to @maya-example" copy fallback remains.
- **Cancel and reset**:
  - Reset demo during a scan cancels it, and the stale result never lands.
  - Cancel then scanning C makes the new result win.
- **Bad inputs** (each recovers with retry, paste and edit choices):
  - PDF → conversion advice
  - HEIC → advice
  - blank PNG → "Couldn't read this receipt…"
  - 20-megapixel PNG → "over 16 megapixels"
  - sideways A fails, then **Rotate 90° and scan** recovers it with Amounts match
  - CDN blocked (model/worker download failure) → "Couldn't read this receipt…" in about 130 ms, and paste still works
- **Keyboard**: Tab reaches the unit chips, Space toggles `aria-pressed`, and the focus outline is 3px solid.
- **Storage**:
  - A corrupt draft or names entry is ignored without a crash.
  - With localStorage throwing, the app works and says "Saving failed; this session still works in memory."
- **Network** (`network.mjs`, page and Web Worker sessions): the only external requests during a scan were three GETs: `tesseract.js@v6.0.1/dist/worker.min.js`, `tesseract.js-core@v6.0.0/tesseract-core-simd-lstm.wasm.js` and `@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz`. **No POST or PUT, and no image or text upload.**
- **No runtime errors** in any production-preview run. The only error-level log is the browser's own worker `importScripts` failure during the deliberate CDN-block test.

### Layout and accessibility (`visual.mjs`: 27/27)

- **390×844, 320×700, 640×450 (layout width of 200% zoom on 1280×900) and 1440×900**:
  - No horizontal scrolling on Snap, Claim or Settle, even with a 21-character diner name, a 50-character item and $1,337.75 amounts.
  - Chips stay 44px tall and keep their full accessible text.
  - The mobile dock never covers the last content (211 px or more clearance), and a focused field stays above it.
  - Desktop uses the 720 + 320 px layout with a sticky summary.
- **Reduced motion**: animations and transitions compute to `none` / `0s`.
- These are scripted geometry checks, not a full accessibility audit; there is no WCAG certification claim.

## Documentation only

- PayPal.Me URL format follows PayPal's public FAQ, as listed in SPLITCORE_RESEARCH.md. No live recipient was used.
- Venmo and Cash App: SplitCore only copies the handle and opens unchanged, allowlisted user links. No live link was available.
- Official rewards pages, fetched with plain GETs (no sign-in):
  - Chick-fil-A forgottoscan → 200
  - Chick-fil-A FAQ → 200
  - Wendy's rewards → 200
  - Wendy's form → 200
  - **McDonald's FAQ → 403 / "Access Denied" to automated clients**. The page could not be confirmed this way.

## Pending (not executed — do not claim)

- **A photo of printed sample A** taken with a real camera. Recognition of photographed paper is unverified; only the generated PNGs were scanned.
- **Phone camera capture** through "Take photo" (`capture="environment"`) on iOS or Android.
- **Phone QR scan**. The QR was decoded from screen pixels with jsQR, not by a phone camera.
- **Native share sheet** on a phone. Desktop headless Chrome exposed `navigator.share`, but no share sheet was opened.
- **Opening a real payer-supplied PayPal, Venmo or Cash App link**; no authorized recipient was available.
- **McDonald's FAQ in a normal browser**; the automated fetch was blocked.
- Screen-reader pass (NVDA or VoiceOver) and real 200% browser zoom. The geometry was emulated by viewport width.
- Event submission requirements: Devpost deadline, category, video and repository rules.

## Known limitations

- Only the supported layout grammar is parsed automatically. Wrapped names, modifiers, multi-column text and handwriting need manual correction.
- First OCR use needs network access to cdn.jsdelivr.net. Offline startup is not supported, and same-origin OCR assets were not packaged because the default delivery worked.
- "Amounts match" checks arithmetic only. Offsetting OCR errors could still match, so the source view stays available.
- Proportional tax, service and tip is a reimbursement convention; item-specific tax exemptions are not modeled.

## P2 status

- **Done**: inline source highlighting. The receipt-source dialog marks lines that became items or discounts, and lines needing review.
- **Omitted**: additional OCR normalization for other receipt layouts; accessibility polish beyond the checks above.

## Recording quick path

1. `cd splitcore && npm run preview -- --host 127.0.0.1`, then open **http://127.0.0.1:4173/** in a clean Chrome profile. Set DevTools device mode to 390×844 if recording a mobile viewport.
2. Warm OCR: **Try a sample → Scan sample image** (Dinner for three) once. Then **Reset demo** and return to **Snap**.
3. Record A (storyboard in SPLITCORE_TEST_AND_DEMO.md §10):
   1. **Scan sample image**, or upload your photo of the printed A with **Choose image** (Exit demo first if you want a real-mode upload, and narrate it accurately).
   2. **Confirm restaurant**.
   3. Enter **33.54**, then click **The extra $5.00 was tip** and **Confirm $33.54 paid**.
   4. Claim: Sandwich 1 → Maya, Sandwich 2 → Jordan, Nuggets → Sam, Fries → **Share with everyone**, Drink 1 → Maya, Drink 2 → Sam.
   5. **Review split** shows $22.52; open Jordan's **Show the math**, then **Copy reminder**, and paste it into a text editor.
   6. Show the **Demo QR** and decode it with an independent scanner app.
   7. **See how** (Points Rescue) shows the official links and the sample warning.
4. Do not open the PayPal format example or any real payment link while recording.
