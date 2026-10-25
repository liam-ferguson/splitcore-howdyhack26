# Handoff — where to pick up

Last updated: October 25, 2026 (~00:10 CDT), by Claude Code. Read this first, then `CLAUDE.md` (rules) and `VERIFICATION.md` (older evidence log).

## What the user asked for in the current round

1. **Payment links must actually work.**
2. **OCR struggles**: it reads periods as commas.
3. **Too complex**: "upload a receipt and it inputs all the totals… every time it asks me to verify and fix." They want a seamless flow with nothing to enter.

## Done in this round (all on `main`)

### Payments (`src/domain/requests.js`, `src/components/Settle.jsx`)

| Provider | Link | Status |
|---|---|---|
| PayPal | `https://paypal.me/{handle}/{9.11}USD` | Live-checked: loads PayPal.Me with the amount. |
| Venmo | `https://venmo.com/{user}?txn=pay&amount=9.11&note=…` | Live-checked: redirects to Venmo's own `account.venmo.com/payment-link?amount=…&recipients=…` page. |
| Cash App | `https://cash.app/$tag` | Only this form is documented by Cash App, and the amount suffix is not; the card shows the amount to type. Cash App's web profiles returned 404 to every automated request here, even for known cashtags, so live opening is unverified. |

- The QR code is now the pay link. Demo mode shows a text QR only when no handle is entered.
- The payer can opt in to "Remember my PayPal/Venmo/Cash App on this device" (`storage.js` key `splitcore:v1:payment`).

### OCR (`src/services/ocr.js`, `src/domain/receipt.js`)

- `repairOcrLine()` fixes prices only: `12,00` → `12.00`, `12;00`, `12. 00`, and `O`/`l`/`I`/`|`/`S`/`B` misread as digits inside a price. Date and time lines are skipped.
- Up to **3 OCR passes**:
  1. enhanced grayscale with contrast stretch, PSM 6
  2. adaptive (Bradley) threshold, upscaled to 2000 px, PSM 6
  3. enhanced, upscaled, PSM 4

  `App.jsx` scores each pass with `evaluate()` and stops at the first one whose receipt adds up.
- Fuzzy discount keywords (one-letter OCR errors, e.g. "Couron" → COUPON). Item names that are mostly uppercase are normalised to uppercase. A trailing period is stripped from merchant names.

### Seamless flow

- **Nothing blocks a readable receipt any more.** The printed total wins. If the parsed lines don't add up to it, the difference becomes `adjustmentCents`, shared in proportion to food and shown as "Receipt adjustment (unread lines)" in each person's math.
- Missing total: the items and charges are used.
- Duplicate totals and tax lines: the reading that makes the receipt add up is chosen automatically.
- Unclear coupons apply to the whole bill.
- Unreadable lines are informational notes inside the collapsed "Receipt details".
- **Paid = receipt total** automatically. Tip is an optional field with 15/18/20% chips (`SET_TIP`). `SET_PAID` with a card total sets the tip. No confirm step.
- **Untapped items are split evenly by everyone** (`split.js`). Tapping is optional.
- **"How many people? 2 3 4 5 6"** buttons (`QUICK_PEOPLE` → You, Friend 2…). The only remaining blockers are: no items, no people, no payer, impossible discounts.

## Verified

- `npm test`: **56/56** pass, rewritten for the new semantics.
- `npm run build`: passes.
- `node scripts/browser-checks/photo-ocr.mjs`: **5/6** photo-like receipts read exactly, including the comma-decimal café. Generate the receipts first with `python -I scripts/make-photo-fixtures.py`. The failure is `cafe-comma-hard`, an extreme blur where commas and digits are destroyed. The app still splits it with a total derived from the items.

## NOT yet done / next steps

1. **Rewrite `scripts/browser-checks/interactions.mjs`** for the new UI. It still expects the old blocking flow (paid confirmation, "The extra $5.00 was tip", "Needs owner", Points Rescue blocking). `visual.mjs` and `tour.mjs` also click old labels ("Confirm", "Same as receipt"). New labels:
   - "Send requests"
   - "Add a tip"
   - "Receipt details"
   - quick-people buttons with `aria-label="3 people"`
   - pay link `.pay-link-btn`
   - "Pay QR"
2. Take screenshots (`tour.mjs`) at 390 px and 1440 px and review the new Claim and Settle layouts by eye.
3. Update `README.md` and `VERIFICATION.md` to the new flow; both still describe confirmations and blocking checks.
4. Optional: try the multi-pass scorer with a fourth pass (PSM 11 sparse text) for column-split receipts.
5. Remote note: `origin` still points at the old URL `liam-ferguson/hackathon`, which GitHub redirects to `liam-ferguson/splitcore-howdyhack26`. Pushes work.

## Commands

```bash
cd splitcore
npm ci && npm test && npm run build
npm run preview -- --host 127.0.0.1          # http://127.0.0.1:4173
python -I scripts/make-photo-fixtures.py     # photo-like OCR fixtures
node scripts/browser-checks/photo-ocr.mjs    # needs local Chrome + running preview
```
