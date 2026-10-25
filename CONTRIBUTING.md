# Contributing

1. Read [`splitcore/HANDOFF.md`](splitcore/HANDOFF.md) for the current status and open tasks, and [`splitcore/CLAUDE.md`](splitcore/CLAUDE.md) for the rules the code follows.
2. Work inside `splitcore/`:
   ```bash
   npm ci
   npm test
   npm run build
   ```
3. Keep the money invariants:
   - all amounts are integer cents
   - one allocator, `apportion`
   - shares always sum exactly to the amount paid
4. Add or update tests in `splitcore/tests/` for any change to parsing, splitting or payment links.
5. Open a pull request against `main`. CI runs the tests and the production build.
