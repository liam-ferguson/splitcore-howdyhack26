# SplitCore

**You cover the bill. We handle the split.**

One person has already paid for the table. They photograph the receipt, add who was there, and tap who had what. SplitCore reads the receipt in the browser, checks that the numbers add up, and works out each person's exact share to the cent. It then prepares itemized reminders, payment-app handoffs and QR codes. It also recognizes 48 US restaurant chains from the receipt and links the payer to that chain's rewards sign-up page.

**Snap → Claim → Settle.**

- **Snap**: drag and drop a photo, take one, choose an image, paste an image (Ctrl+V), paste receipt text, or enter the bill by hand. OCR runs locally in a Web Worker (Tesseract.js). While it reads, the real image is shown with the engine's actual stage and progress, and you can cancel.
- **Claim (nothing required)**: every total is filled in from the receipt automatically.
  - Tap **How many people? 2 3 4 5 6**, or add names. The split is ready immediately: anything you don't tap is split evenly.
  - Optional: tap people onto items one person had, so a 2-sandwich line becomes two units and a unit can be shared. You can also **Add a tip** (with 15/18/20% buttons); the paid amount is the receipt total plus that tip.
  - The printed total always wins. If some lines couldn't be read, the small difference is shared fairly and shown in each person's math as "Receipt adjustment". Duplicate totals and unclear coupons are resolved automatically.
  - All the details stay available under **Receipt details**.
- **Settle**: an animated hero shows how much the payer gets back, with a donut chart of everyone's share. Add your PayPal, Venmo or Cash App once (and optionally remember it on this device). Each person then gets a **Pay $X** button and a **Pay QR** with their exact amount, plus a copyable request message and the full math.
- Loading a new receipt replaces the current bill immediately, with an **Undo** toast.

No backend, accounts, API keys, payment processing or cloud OCR.

**Design:** a dark "night market" theme (deep ink with lime, cyan and violet accents) using Inter with optical sizing. Each person has their own color across chips, bars and charts. Motion includes spring transitions, staggered entrances, a scan beam over the actual image, count-up money and a small celebration when the split checks out. Everything respects `prefers-reduced-motion`, keeps 44 px+ touch targets and visible focus, and reflows down to 320 px.

## Run it

Requires Node 22.12+ (developed on Node 24.22.1).

```bash
cd splitcore
npm ci
npm test                                   # domain tests (node:test)
npm run build
npm run preview -- --host 127.0.0.1        # http://127.0.0.1:4173/
```

`npm run dev` starts the Vite dev server instead. The first scan downloads the OCR worker, engine and English model (about 3 MB) from cdn.jsdelivr.net. After that, the browser usually caches them. **Offline use is not supported or promised.**

## Demo mode

Use **Try a sample** on the Snap screen. Demo mode keeps its own bill in memory, separate from any real bill you were working on.

- **Scan sample image** sends the PNG in `public/demo/` through the same OCR service and parser as an upload. Nothing is pre-parsed.
- **Use sample text** sends the fixture text straight to the parser and is labeled "Sample text — not a scan".
- Maya, Jordan and Sam are pre-added with Maya as payer. Nothing is claimed and the paid amount is not confirmed.
- Payment destinations are replaced by text-only demo QR codes, for example `SPLITCORE DEMO | No payment | Jordan | USD 9.11 | …`. Reminders start with "DEMO — sample only; no payment requested."
- **Reset demo** cancels any running scan and starts a clean demo bill. **Exit demo** returns to your real bill.

Sample receipts are fictional and are marked "NOT VALID FOR PAYMENT OR REWARDS". The Chick-fil-A header on sample A exists only to exercise the rewards finder, and its prices are invented. The pizza sample ("SPLITCORE CAFE") correctly finds no rewards program.

## Supported receipts

Printed English, USD, one receipt, upright, one item per line, with the amount on the right. PNG, JPEG or WebP up to 15 MB and 16 megapixels. HEIC and PDF are rejected with conversion advice. There is a **Rotate 90°** retry and a **grayscale** retry.

Item forms recognized automatically:

```
BURGER 8.00
2 SANDWICH 12.00          (12.00 is the line total for both)
2 x DRINK 3.20
DRINK x2 3.20
2 SANDWICH @ 6.00 12.00   (checked: 2 × 6.00 must equal 12.00)
```

Summary lines:

- `SUBTOTAL`
- `TAX` / `SALES TAX` / `STATE TAX`…
- `SERVICE` / `SERVICE CHARGE` / `GRATUITY`, plus fee lines such as `DELIVERY FEE`, `SERVICE FEE` and `BAG FEE` (these are shared like a service charge)
- `TIP`
- `TOTAL` / `GRAND TOTAL` / `TAKE-OUT TOTAL` / `AMOUNT DUE`

Differently labelled tax or fee lines (for example `STATE TAX` + `CITY TAX`) are added together, with a visible note. The same label printed twice, or two different totals, asks you to choose.

The parser ignores cash, change, card, tender, "amount paid" and rounding lines, tax rates, suggested-tip tables, and date, time, order and store lines. Priced lines after the total are shown as non-blocking notes, and $0.00 promo lines are ignored.

Discounts are treated as follows:

- `BILL DISCOUNT` and `RECEIPT DISCOUNT` apply to the whole bill.
- `<ITEM NAME> DISCOUNT` applies to that item, but only if exactly one line has that name.
- `COUPON`, `PROMO` and unlabeled negative amounts wait for you to choose what they apply to.

Lines with a price that can't be read are kept, and you add them as items or exclude them. Free ($0.00) items don't need an owner. SplitCore never invents a charge or adds a balancing adjustment. Wrapped descriptions, modifiers, multi-column layouts and handwriting need manual correction. **There is no general claim of OCR accuracy.**

The restaurant name is the first header line that looks like a business name. Addresses, phone numbers, "WELCOME TO" and copy/check boilerplate are skipped, and you can edit the name.

## How the split is calculated

All amounts are integer cents, and one largest-remainder allocator handles every rounding step:

1. Each line total is split equally into its units. Item discounts are spread over that item's units.
2. Each unit is split equally among the people who claimed it.
3. Bill discounts are shared in proportion to each person's food.
4. Tax, included service, printed tip and extra tip are each shared separately, in proportion to food after discounts.
5. Penny ties go to people in the order they were added. Every bucket and the grand total add up exactly to the amount paid.

The payer's share is part of the total, but nobody is asked to pay the payer's share back to them. If food after discounts is $0, charges are only split equally after you explicitly choose that.

This is a reimbursement convention. It is not tax advice and does not model item-specific tax rules.

Sample A works out to: Maya **$11.02** (paid), Jordan **$9.11**, Sam **$13.41**. Maya gets back **$22.52**.

## Payments, QR codes and messages

SplitCore **prepares** requests. It never sends or processes them, and it has no "paid" status.

| Method | What SplitCore does |
|---|---|
| None | Amount, itemized breakdown, Copy/Share |
| PayPal.Me | `https://paypal.me/{name}/{amount}USD`, which opens PayPal.Me with the amount filled in (checked live on October 24, 2026). |
| Venmo | `https://venmo.com/{user}?txn=pay&amount={amount}&note=…`, which redirects to Venmo's own payment-link page with the recipient, amount and note filled in (checked live). In the Venmo app it opens the pay screen. |
| Cash App | `https://cash.app/$cashtag`, Cash App's documented payment link. An amount in the URL isn't documented, so the card shows the amount to type. |

Handles are checked for format only; SplitCore can't confirm who owns an account. The person paying always reviews and confirms inside their own app. Each **Pay QR** encodes the same pay link, so a friend can scan it to pay. In demo mode, with no handle entered, the QR holds a text breakdown instead.

QR codes are generated locally. Copy confirms success only after the clipboard write succeeds; if the clipboard is blocked, the text is shown selected so you can copy it manually.

## Rewards finder

SplitCore looks at the receipt and checks whether the restaurant has a rewards program. The directory covers **48 US chains**, from Chick-fil-A, McDonald's, Starbucks, Domino's, Pizza Hut and Papa Johns to Whataburger, Raising Cane's and Torchy's Tacos.

- **How it decides:**
  1. Your own choice wins.
  2. Otherwise it matches the restaurant name.
  3. Otherwise it tries the other header lines (before the first price).
  4. Otherwise it tries a website printed on the receipt, such as `papajohns.com`.

  Item lines are never searched, so "PIZZA HUT STYLE CRUST" or "WENDY BURGER" on another restaurant's receipt can't trigger a match. Whole names only: "Wendy burger" is not Wendy's. The card always shows its evidence, for example *Found "Chick-fil-A" at the top of your receipt*.
- **What you get:**
  - A **Join {program}** button that opens the chain's official rewards or sign-up page in a new tab.
  - For Chick-fil-A One, MyMcDonald's Rewards and Wendy's Rewards, verified steps for **adding a missed visit**, plus copyable receipt details. These use the receipt's own total, not the amount with added tip.
- **Wrong or missing?** Use **Not {restaurant}?** or **Choose a restaurant** to search the directory, or pick **None of these**. Editing the restaurant name re-runs detection on the new name.
- **Every link was loaded and checked on October 24, 2026.** Run `node scripts/browser-checks/rewards-links.mjs` to re-check. Where a page didn't state an official program name, SplitCore uses a plain descriptive name (such as "Burger King rewards") rather than guessing. SplitCore uses no logos: each restaurant gets a neutral monogram tile.
- SplitCore never says a receipt is eligible, never estimates points, never signs in and never submits anything. Sign-up happens on the restaurant's site. Samples always say "Sample only — do not submit."

## Privacy and storage

- Receipt images, OCR text and payment details stay in memory only.
- **Remember names on this device** is opt-in.
- **Keep a local draft** is opt-in. It saves items, charges, claims and names only, with no order or receipt identifiers, and asks you to confirm the paid amount again after you restore it.
- If storage is blocked or corrupt, SplitCore keeps working in memory.
- **Clear SplitCore data on this device** removes only SplitCore's keys.

## Project layout

```
src/domain/     money.js (parseCents, apportion), receipt.js (parser, reconciliation),
                split.js (allocation), requests.js (links, messages, demo payload), rewards.js
src/services/   ocr.js (one worker, cancel, stale-job guard, 45 s no-progress watchdog), storage.js
src/state.js    single reducer, boundary validation, sanitized drafts
src/components/ Snap, Claim, Settle, Rewards, ui primitives (motion, rings, charts, dialogs, toasts, error boundary)
src/demo/       fixture TEXT only
public/demo/    sample PNGs rendered from that text (scripts/make-fixtures.mjs)
fixtures/       QA images: changed-price C, renamed A, tax-typo A
tests/          node:test suites (58 tests)
scripts/browser-checks/  zero-dependency Chrome DevTools checks against the production preview
```
