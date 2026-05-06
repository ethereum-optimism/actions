---
'@eth-optimism/actions-sdk': minor
---

Export `SWAP_PROVIDER_NAMES` runtime constant alongside the existing `SwapProviderName` type. Consumers (CLI, custom validators) that need to enumerate provider names at runtime can now import the canonical list from the SDK barrel instead of hardcoding their own. `SwapProviderName` is now derived from `SWAP_PROVIDER_NAMES`, so adding a new provider is a single-line change in `packages/sdk/src/types/providers.ts`.
