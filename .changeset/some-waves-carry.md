---
'@eth-optimism/actions-sdk': minor
---

Features / API additions

#451 — Add chainIds param to wallet.getBalance()
#428 — Configurable approval-amount strategy: callers can now choose between exact-amount and unlimited approvals when opening positions.
#356 — Wallet refactor: native support for local EOA wallets; the embedded (4337) wallet is now optional rather than required.
#383 — Shared namespace foundations: reorganizes shared internals to support multiple action domains (lend, borrow, swap) under a common surface.
#445 — Introduces an ActionsError base class and migrates bare throws across the SDK into named subclasses, giving consumers structured errors to catch.

Fixes

#443 — Bug fix in VelodromeProvider impacting EOA swaps, which previously reverted with TRANSFER_FAILED because the encoder always pre-transferred tokens to the router.
#434 — Bug fix in swap execution where a quote’s recipient did not match the execute call’s recipient; the SDK now rejects the mismatch instead of silently routing funds to the wrong address.
#441 — Bug fix in UniswapV4Provider affecting exact-output single-hop swaps, which used the wrong action byte and produced invalid calldata.
#426 — Bug fix in swap execution for calls that omitted a recipient; the SDK now defaults to the wallet address instead of leaving it unset.

Tooling

#385 — Bump runtime to Node 22.14.0.
#372 — Parallelize the test suite.
