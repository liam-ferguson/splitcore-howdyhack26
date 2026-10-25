# SplitCore — Verification log

Last full run: **October 24, 2026**, about 23:30 CDT, after the redesign and bug-fix pass.
Environment: Windows 11 Pro 10.0.26200, Node **24.22.1**, npm 11.19.1, Google Chrome **156.0.8078.47**, run headless and driven over the DevTools Protocol by `scripts/browser-checks/` (no test-framework dependency). All browser checks ran against the **production build** (`vite preview`, http://127.0.0.1:4173). No physical phone was used.

## Status labels

- **Automated pass**: `npm test` (Node built-in test runner)
- **Browser observed**: scripted Chrome checks against the production preview, with screenshots reviewed by eye
- **Pending**: needs a physical device, a real account or a human
- **Known limitation**

## Versions (lockfile)

react / react-dom 19.3.1 · vite 8.3.5 · tesseract.js 6.0.1 · tesseract.js-core 6.1.2 installed · qrcode 1.5.4 · Inter 4.1, self-hosted.

At runtime, tesseract.js 6.0.1 loads its worker, the `tesseract.js-core@v6.0.0` engine and the `@tesseract.js-data/eng` `4.0.0_best_int` model from cdn.jsdelivr.net (observed). No new dependencies were added in the redesign; all motion is CSS plus a small `requestAnimationFrame` tween.

## Bugs found and fixed in this pass

| # | Bug | Effect | Fix |
|---|---|---|---|
| 1 | A scan finishing checked the bill **captured when the scan started** (stale closure), and a "Replace bill?" dialog stayed on Snap | After dismissing the dialog, "Continue" reopened the old Chick-fil-A bill while you were scanning something else — the likely source of the reported "asked if it was Chick-fil-A for a pizza receipt" | New receipts read the latest state through a ref and replace the bill immediately, with an **Undo** toast. Undo returns to the previous bill's Claim view. Snap names the bill in progress ("Chick-fil-A bill in progress"). Regression test: a pizza receipt after a Chick-fil-A bill shows no Chick-fil-A text anywhere. |
| 2 | Rewards detection only knew 3 chains and needed a separate "Confirm restaurant" step | Most restaurants got nothing | 48-chain directory. Evidence-based detection (name → header → printed website; never item lines). Visible evidence, a searchable picker, and "None of these". |
| 3 | Merchant detection could pick an address, phone number, "CUSTOMER COPY" or "WELCOME" line | Wrong name, wrong or no rewards match | The header-line scorer skips boilerplate, addresses, phones and city/ZIP lines, and strips "WELCOME TO". |
| 4 | Real receipts' payment lines after the total ("AMOUNT PAID", unknown priced lines) blocked settlement | You couldn't finish | Post-total priced lines are non-blocking notes, and more tender lines are recognized. |
| 5 | Delivery, service and bag **fee** lines became food items you had to claim; "ROOM SERVICE BURGER" could become a service charge | Wrong split, or a stuck bill | Fee lines go to the "Service & fees" bucket, and the service pattern is anchored to the start of the line. |
| 6 | $0.00 items had to be claimed, and $0.00 promo lines created a blocking discount | Needless blockers | Free units are optional to claim; zero-value promos are ignored. |
| 7 | A saved draft containing an item discount whose item had been deleted was **rejected entirely** on restore | Lost draft | The draft restores, with the same "choose what this applies to" issue. |
| 8 | "Correct the amounts instead" always focused the paid field (`focus() ?? …` evaluates both sides) | The button did the wrong thing | It now opens the bill editor and focuses the right field. |
| 9 | Unreadable-line issues had no focus target, so "Fix bill" did nothing for them | Dead button | Issues have ids and Fix focuses them. |
| 10 | Failed OCR's "Edit the bill" threw away the recognized text | Re-typing everything | "Edit what we read" loads the partial text. |
| 11 | A receipt image URL wasn't tied to its bill | "View source" could show another bill's image after switching between demo and real, or after Undo | Each bill stores its own image URL; old URLs are revoked once no bill uses them. |
| 12 | Found during redesign QA: entrance animations used `fill-mode: both`, leaving a transform on the page wrapper | The fixed mobile dock was positioned off-screen | Entrance animations use `backwards` fill, and the dock renders through a portal. |
| 13 | Found during redesign QA: grid tracks auto-sized to content | Long names widened the page by 23 px at 320 px | Grid tracks are clamped with `minmax(0, 1fr)`, plus `min-width: 0` on the flex text. |
| 14 | Found during redesign QA: a generic input rule out-specified the money-input padding | "$33.54" displayed as "$3.54" | Fixed specificity. The same fix applies to the search field. |
| 15 | Clicking "Try a sample", or closing a dialog whose opener was removed, dropped keyboard focus to `<body>` | Keyboard users lost their place | Focus moves to the samples heading, or falls back to main content. |
| 16 | Reduced-motion users would never see a chip's checkmark, because it is drawn by an animation | Missing state indicator | The checkmark is shown statically under `prefers-reduced-motion`. |

## Automated pass — `npm test`: 58 tests, 0 failures

The earlier suites still pass:

- **money**: parsing, the allocator, and a 600-case conservation loop
- **parser**: fixtures A, B and C field for field; quantity forms; subtotal and total interpretations; excluded lines; uncertain lines; discount scopes; tip states
- **allocation**: exact tables for A, B and C; payer change → $20.13; ties; assignment variants; quantity invalidation; zero basis; 200 generated bills conserve every cent; drafts; demo/real separation
- **requests**: PayPal string; URL allowlists; Venmo and Cash App; exact demo payload

New in this pass:

- **Merchant detection**:
  - "WELCOME TO / DOMINO'S PIZZA / 123 MAIN ST" → "DOMINO'S PIZZA"
  - address, phone and ZIP lines are skipped
  - copy/check boilerplate gives no merchant
  - printed websites are captured
- **Lines**:
  - `STATE TAX` + `CITY TAX` add up with an info note; the same `TAX` label twice asks for a choice
  - fees go to "Service & fees"
  - "ROOM SERVICE BURGER" stays an item
  - post-total lines and $0.00 promos are non-blocking
  - leading "+" is stripped from item names
- **Rewards matching**:
  - 15 real-world header variants match the right chain
  - 7 near-misses don't ("Wendy burger", "THE PIZZA SHACK", "DQUICK MART", "Starbuck Lane Diner"…)
  - a pizza receipt with "PIZZA HUT STYLE CRUST" and "WENDYS FRIES" items matches nothing
  - header-line and website (`papajohns.com`) matches work
  - a user choice or "none" wins
  - an edited merchant name is the only evidence used
  - all 48 directory URLs are HTTPS on the brand's own domain, with unique ids
  - search ranks name matches first
- **State**:
  - $0.00 units are optional
  - an orphaned item-discount draft restores
  - editing the merchant clears a manual rewards choice
  - `loadId` increments on each new receipt

## Browser observed — production preview

### Real OCR (`ocr-evidence.mjs`, via the real file input)

| Image | Result |
|---|---|
| `public/demo/sample-a.png` | Every field correct (Chick-fil-A, 4 lines, bill discount, subtotal, tax, service, $28.54), Amounts match |
| `public/demo/sample-b.png` | Correct; PIZZA DISCOUNT targets PIZZA only |
| `public/demo/sample-c.png` | Correct, $10.01 |
| `fixtures/penny-diner-changed.png` | **$10.02** read; the result follows the image |
| `fixtures/renamed-receipt-photo.png` | Same as A; the filename has no effect |
| `fixtures/sample-a-tax-typo.png` | "Items and charges are $1.00 below the receipt total. Review the highlighted lines." |

Wall times were 0.7–2.1 s per image on this desktop, including page load. This is not a speed claim.

### Acceptance flows (`interactions.mjs`: 67/67 pass)

- **Discrepancy**:
  - Tax 2.08 → 1.08 shows the $1.00 warning and disables settlement and the Settle step.
  - Paid confirmation is cleared.
  - "Review" focuses Tax; fixing it needs reconfirmation.
- **Extra tip**: raising the paid amount is blocked until it's classified; classifying once does not duplicate the tip.
- **Settle**:
  - Headline **$22.52** (exact cents read from `data-cents`), "Maya's share $11.02 · Paid $33.54", and no card asking Maya to pay herself.
  - Payer changed to Sam (radio pills) gives **$20.13**, with shares unchanged at 1102/911/1341.
- **People dialog**: rename keeps amounts and paid confirmation; a duplicate name shows an error; Remove returns that person's units to "Needs owner".
- **Invalidation**: unclaiming shows the exact remaining unit and hides final totals; a quantity edit clears only that line.
- **Reported-bug regression**:
  1. After a claimed Chick-fil-A bill, Snap shows "Chick-fil-A bill in progress".
  2. Loading the pizza sample shows **SPLITCORE CAFE**, never the text "Chick-fil-A", "No rewards program found for SPLITCORE CAFE", and zero claims.
  3. **Undo** restores the Chick-fil-A bill with all 8 claim chips.
- **Rewards**:
  - Picker → Domino's gives a Join link `https://www.dominos.com/my-deals-and-rewards`, labelled "You chose this restaurant".
  - Editing the merchant to "Pizza Hut #4421" switches to Hut Rewards; "None of these" turns lookup off.
  - Chick-fil-A is detected automatically, with Join → `https://www.chick-fil-a.com/one`.
  - The "Add this visit" dialog shows the sample warning, $28.54 (not $33.54), "Join or sign in…" and the checked date.
  - All 3 links use `target=_blank rel="noopener noreferrer"`. Escape closes the dialog and focus returns to its opener.
- **Copy**: the clipboard read back the exact Jordan reminder; with the clipboard denied, a focused, selected textarea fallback appears.
- **Demo QR** (dialog):
  - Exact payload text, and no PayPal, Venmo or Cash App links anywhere in demo.
  - The **rendered QR, screenshotted and decoded independently with jsQR**, gives exactly `SPLITCORE DEMO | No payment | Jordan | USD 9.11 | Food 6.84 + tax 0.57 + service 0.34 + extra tip 1.36 | Sample only`.
  - The payload updates after an assignment edit, and focus returns to the button.
- **Real mode**:
  - A pasted `TAPAS 7.01` shared between two people gives 3.51/3.50.
  - PayPal.Me builds `https://paypal.me/SplitCoreExample/3.50USD` (not opened).
  - A lookalike Venmo URL is rejected, with the handle fallback kept.
- **Cancel / reset**: Reset demo during a scan cancels it and no stale result lands; cancel then a new scan makes the new one win.
- **Bad inputs** (each recovers with retry, paste and edit choices):
  - PDF → advice
  - HEIC → advice
  - blank → "Couldn't read this receipt…"
  - 20-megapixel image → limit message
  - sideways A → **Rotate 90° and scan** reaches Amounts match
- **Keyboard**: Tab reaches chips; Space toggles `aria-pressed`; the focus ring is 3px solid; payer radios move with the arrow keys.
- **Storage**: corrupt data is ignored; with localStorage throwing, the app works and explains the failure.
- No runtime errors.

### Layout, motion and accessibility (`visual.mjs`: 27/27; `overflow.mjs`; `tour.mjs`)

- **No horizontal overflow** at 320, 360, 390, 640 (layout width of 200% zoom on 1280) and 1440 px, with a 21-character name, a 50-character item and $1,337.75 amounts.
- Chips are 44 px or taller and keep their full names.
- The fixed mobile dock is visible and never covers the last content or a focused field.
- `prefers-reduced-motion` turns off animations and transitions.
- Screens reviewed by eye at 390×844 and 1440×900: Snap, demo samples, live scan, Claim (top, items, ready), Settle (hero, donut, cards), QR dialog, rewards dialog, restaurant picker.

### Other checks

- **Network during a scan** (`network.mjs`, page and Web Worker): the only external requests are 3 GETs to cdn.jsdelivr.net for the worker, core and model. No POST or PUT; the image and text never leave the browser.
- **Model download blocked** (`offline-model.mjs`): "Couldn't read this receipt…" in about 140 ms, and paste still works.
- **Source highlighting** (`source-view.mjs`): item and discount lines are marked; unreadable and unresolved lines are flagged for review.
- **Rewards links** (`rewards-links.mjs`): **53/53** directory URLs load.
  - 42 returned 200 to a plain request.
  - 11 sites' bot protection blocked plain requests; those pages rendered correctly in Chrome.
  - The McDonald's FAQ, blocked in the first pass, now loads.
- A clean `npm ci` → test → build reproduction passed in the first pass. No dependencies changed since; `package-lock.json` is unchanged.

## Pending (not executed — do not claim)

- A photo of a **printed** receipt taken with a real camera (only generated PNGs were scanned), and phone camera capture through "Take photo".
- A **phone** scan of the QR. It was decoded from screen pixels with jsQR, not by a phone camera.
- The native share sheet on a phone, and opening a real payer's PayPal, Venmo or Cash App link.
- Signing up for or claiming on any rewards program. SplitCore only links; no account was created.
- A screen-reader pass (NVDA or VoiceOver) and real browser zoom (emulated here by viewport width).
- Event submission rules (Devpost deadline, category, video, repository).

## Known limitations

- Only the supported layout grammar is parsed automatically; wrapped names, modifiers, multi-column text and handwriting need manual edits.
- First OCR use needs network access to cdn.jsdelivr.net; offline startup is not supported.
- "Amounts match" checks arithmetic only. Offsetting OCR errors could still match, so the source view stays available.
- The rewards directory is static (48 US chains). Program terms and URLs can change; re-run `rewards-links.mjs` before demoing. Missed-visit steps are verified for Chick-fil-A, McDonald's and Wendy's only.
- Dark theme only.

## Recording quick path

1. `cd splitcore && npm run preview -- --host 127.0.0.1`, then open **http://127.0.0.1:4173/** in a clean Chrome profile. Use DevTools device mode at 390×844 for a phone-sized take.
2. Warm OCR: **Try a sample → Scan sample image** (Dinner for three), then **Reset demo**.
3. Record:
   1. Scan sample A; the scan beam runs over the real image, with real progress.
   2. Point out the **Chick-fil-A One** rewards card ("Found 'Chick-fil-A' at the top of your receipt").
   3. Enter **33.54**, then click **The extra $5.00 was tip** and **Confirm**.
   4. Claim: Sandwich 1 → Maya, Sandwich 2 → Jordan, Nuggets → Sam, Fries → **Share with everyone**, Drink 1 → Maya, Drink 2 → Sam. The ring completes and the burst plays.
   5. **Review split**: the $22.52 count-up and the donut.
   6. On Jordan's card, **Show the math**, then **Copy reminder**, then **Demo QR**.
   7. **Add this visit** shows the rewards dialog.
   8. Optionally, go back to Snap → **Use sample text** on the pizza sample to show "No rewards program found", then **Undo**.
4. Do not open real payment links, or sign up for rewards programs, on camera.
