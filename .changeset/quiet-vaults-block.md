---
'@eth-optimism/actions-sdk': patch
---

Enforce `marketBlocklist` on lend providers. `LendProvider` now rejects blocklisted markets when opening, closing, or reading a position, and omits them from `getMarkets`. Caller-supplied market lists are filtered through the allowlist and blocklist as well.
