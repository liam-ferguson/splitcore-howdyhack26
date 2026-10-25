# SplitCore — working notes for Claude

Browser-only React/Vite app. No backend, server, database, auth, AI API, payment SDK or cloud OCR.
Plans (frozen): `../SPLITCORE_MASTER_PLAN.md`, `../SPLITCORE_CLAUDE_IMPLEMENTATION.md`,
`../SPLITCORE_TEST_AND_DEMO.md`, `../SPLITCORE_RESEARCH.md`. Progress log: `VERIFICATION.md`.

## Money invariants
- All amounts are integer cents. Never `parseFloat`; user input goes through `parseCents`.
- One allocator: `apportion` (BigInt products, largest remainder, ties by diner creation `order`).
- Item price is the extended line total; never multiply by quantity.
- Order: units → item discounts → equal owner shares → bill discount by food → each charge bucket
  (tax, service, printed tip, extra tip) independently by net food.
- `G − I − B + T + S + P` must equal the receipt total exactly; paid = receipt total + extra tip,
  and extra tip is set only by an explicit user action. No balancing adjustments.
- Payer's share stays in the sum; requests go only to non-payers. Demo mode never emits a financial link.
- `parseReceipt(text)` takes only text — never a filename, mode or fixture result.

## Commands
- `npm test` — Node built-in tests for money, parser, split, requests, state.
- `npm run build` then `npm run preview -- --host 127.0.0.1`.
