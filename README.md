# SplitCore

**You cover the bill. We handle the split.**

SplitCore turns a photo of a restaurant receipt into exact, per-person payment requests. Snap the receipt, say how many people were there, and send everyone a pay link for their share, down to the cent. It runs entirely in the browser: no backend, no accounts, no API keys.

Built for HowdyHack 2026 (Texas A&M).

## Features

- **Snap**: take a photo, upload one, drag and drop, or paste an image. Receipt OCR (Tesseract.js) runs on your device and makes up to three passes. It fixes common misreads such as `12,00` → `12.00`.
- **Automatic totals**: items, discounts, tax, fees, tip and the total are filled in for you. The printed total always wins; any unreadable difference is shared fairly and shown in each person's math.
- **Claim (optional)**: tap who had what. Anything untapped is split evenly. Shared plates split by unit.
- **Settle**: exact shares with integer-cent rounding. Each person gets:
  - a **PayPal** or **Venmo** pay link with the amount filled in, or a **Cash App** link
  - a scannable pay QR
  - a copyable request message
- **Rewards finder**: recognizes 48 US restaurant chains and links to their official rewards sign-up page.

## Quick start

Requires Node 22.12+.

```bash
cd splitcore
npm ci
npm run dev                                  # development server
# or
npm run build && npm run preview -- --host 127.0.0.1   # production preview at http://127.0.0.1:4173
```

Use **Try a sample** in the app for fictional demo receipts.

## Tests

```bash
cd splitcore
npm test        # Node's built-in test runner: money, parser, split, payment links, rewards
```

Browser end-to-end checks (they need a local Chrome and a running preview) live in `splitcore/scripts/browser-checks/`. See its README.

## Repository layout

```
splitcore/                 the app (React + Vite)
  src/domain/              pure logic: money, receipt parser, split, payment links, rewards
  src/services/            OCR worker and optional local storage
  src/components/          Snap, Claim, Settle, Rewards, UI primitives
  tests/                   node:test suites
  scripts/                 fixture generators and browser checks
  README.md                full product and technical documentation
  HANDOFF.md               current status and next steps for contributors
  THIRD_PARTY_NOTICES.md   dependency and font licenses
```

## Privacy and limits

- Receipt images and text never leave the browser. The first scan downloads the public OCR model from a CDN.
- SplitCore prepares payment requests; it never moves money or signs in to payment or rewards accounts.
- OCR accuracy depends on photo quality. Very blurry receipts may need a quick edit under **Receipt details**.

## License

[MIT](LICENSE) for SplitCore's own code. Third-party components keep their own licenses; see [`splitcore/THIRD_PARTY_NOTICES.md`](splitcore/THIRD_PARTY_NOTICES.md).
