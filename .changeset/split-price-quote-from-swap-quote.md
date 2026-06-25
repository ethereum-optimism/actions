---
'@eth-optimism/actions-sdk': minor
---

Split price quotes from executable quotes so `actions.swap.getQuote` no longer leaks the Universal Router `msg.sender` sentinel.

- New `PriceQuote` type: pricing, amounts, route, and metadata only — no
  `recipient` and no `execution` data. It is structurally un-executable.
- `actions.swap.getQuote` / `getQuotes` (no wallet bound) now return
  `PriceQuote` instead of `SwapQuote`. Previously these carried
  `recipient = 0x..01` (the Universal Router `msg.sender` sentinel) when no
  recipient was supplied — a value the `recipient: Address` type implied was a
  real, executable address.
- `wallet.swap.getQuote` / `getQuotes` still return the full `SwapQuote`
  (recipient bound to the wallet, `execution` present); `wallet.swap.execute`
  is unchanged.
- **Breaking (types):** consumers reading `recipient` / `execution` off the
  result of `actions.swap.getQuote` must re-quote via `wallet.swap.getQuote` to
  obtain an executable `SwapQuote`. The dropped fields were either the sentinel
  or, post strict-recipient-match, un-executable.

Resolves the type/value mismatch flagged in #8.
