# SplitCore

**You cover the bill. We handle the split.**

One person has already paid for the table. They photograph the receipt, add who was there, and tap who had what. SplitCore reads the receipt in the browser, checks that the numbers add up, and works out each person's exact share to the cent. It then prepares itemized reminders, payment-app handoffs and QR codes. For a few supported restaurants, it also points the payer to the official process for claiming missed rewards points.

**Snap → Claim → Settle.**

- **Snap**: take a photo, choose an image, paste receipt text, or enter the bill by hand. OCR runs locally in a Web Worker (Tesseract.js) and shows real progress. You can cancel a scan.
- **Claim**: the recognized items appear immediately. **CoreCheck** confirms that items, discounts, tax, service and printed tip add up to the receipt total, and points you to the line that needs fixing when they don't. Enter the final amount you paid. If it's more than the receipt, you mark the difference as extra tip yourself. Then tap people onto each unit: a 2-sandwich line becomes two units, and a unit can be shared by several people.
- **Settle**: shows how much the payer gets back, the payer's own share, and a card for each other person. Each card has the full arithmetic, a Copy reminder button, optional Share, and an optional PayPal.Me link, Venmo/Cash App handoff or QR code.

No backend, accounts, API keys, payment processing or cloud OCR.

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

Sample receipts are fictional and are marked "NOT VALID FOR PAYMENT OR REWARDS". The Chick-fil-A header on sample A exists only to exercise Points Rescue, and its prices are invented.

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

Summary lines: `SUBTOTAL`, `TAX`/`SALES TAX`, `SERVICE`/`SERVICE CHARGE`/`GRATUITY`, `TIP`, `TOTAL`/`GRAND TOTAL`/`TAKE-OUT TOTAL`. The parser ignores cash, change, card and tender lines, tax rates, suggested-tip tables, and date, time, order and store lines. Discounts are treated as follows:

- `BILL DISCOUNT` and `RECEIPT DISCOUNT` apply to the whole bill.
- `<ITEM NAME> DISCOUNT` applies to that item, but only if exactly one line has that name.
- `COUPON`, `PROMO` and unlabeled negative amounts wait for you to choose what they apply to.

Lines with a price that can't be read are kept, and you add them as items or exclude them. Several conflicting totals or tax lines ask you to choose one. SplitCore never invents a charge or adds a balancing adjustment. Wrapped descriptions, modifiers, multi-column layouts and handwriting need manual correction. **There is no general claim of OCR accuracy.**

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
| PayPal.Me | `https://paypal.me/{name}/{amount}USD`, using the documented format. The name is checked for format only, not for whether the account exists or who owns it. |
| Venmo / Cash App | Copy username or $cashtag plus the amount. Optionally opens your own profile link, unchanged, but only on `venmo.com`/`account.venmo.com` or `cash.app` over HTTPS. SplitCore never adds an amount or builds a deep link. |

QR codes are generated locally. Copy confirms success only after the clipboard write succeeds; if the clipboard is blocked, the text is shown selected so you can copy it manually.

## Points Rescue

Points Rescue is a small, fixed US directory covering Chick-fil-A One, MyMcDonald's Rewards and Wendy's Rewards. Policies were checked on October 24, 2026. It appears only after you confirm that the restaurant name in the receipt header matches.

It shows the restaurant's official instructions and links, plus copyable receipt details. Those details use the receipt's own total, never the amount including added tip, and mark missing fields as "not recognized". SplitCore never says a receipt is eligible, never estimates points, never signs in and never submits anything. Samples always say "Sample only — do not submit."

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
src/components/ Snap, Claim, Settle, Rewards, ui primitives
src/demo/       fixture TEXT only
public/demo/    sample PNGs rendered from that text (scripts/make-fixtures.mjs)
fixtures/       QA images: changed-price C, renamed A, tax-typo A
tests/          node:test suites
```

## Before submitting to HowdyHack

The 2026 Devpost page (`https://hh26.devpost.com/`) could not be read during planning. Before submitting, confirm these with the organizers or the official portal:

- deadline and timezone
- category wording
- repository visibility
- video length and hosting
- judging criteria

Disclose that the project was built with Claude Code, and list the libraries above. See `THIRD_PARTY_NOTICES.md`.

## Recording the demo

See `VERIFICATION.md` → "Recording quick path".
