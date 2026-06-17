---
'@eth-optimism/actions-sdk': minor
---

Drop the redundant `borrowProvider` and `lendProvider` fields from
`BorrowMarketConfig`. The `kind` discriminant already routes a market to its
provider, so the provider name no longer needs to be stored on every market
config. The CLI derives the display provider name from `kind` via the new
exported `borrowProviderForKind(kind)` helper.
