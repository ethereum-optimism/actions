---
'@eth-optimism/actions-sdk': minor
---

Decouple the swap allowance owner from the quote recipient.

`SwapQuote` now carries an explicit `walletAddress` (the executing wallet whose
ERC-20 / Permit2 allowances are read when building approvals), distinct from
`recipient` (who receives the output tokens). `UniswapSwapProvider` and
`VelodromeSwapProvider` `_buildApprovals` now read allowances against
`quote.walletAddress` instead of reusing `quote.recipient`. This fixes a latent
bug where a raw swap with a custom `recipient` checked allowances against the
recipient rather than the executing wallet; for EOAs and current smart-wallet
implementations the two coincide, so behavior is unchanged there.
