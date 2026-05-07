---
'@eth-optimism/actions-sdk': minor
---

Export `LEND_PROVIDER_NAMES` and `APPROVAL_MODES` runtime constants from the SDK barrel, mirroring the existing `SWAP_PROVIDER_NAMES` pattern. `LendProviderName` is now derived from `LEND_PROVIDER_NAMES`, so adding a new lend provider is a single-line change in `packages/sdk/src/types/providers.ts`. `ApprovalMode` is now derived from `APPROVAL_MODES`. Consumers (CLI, custom validators) can drop their hardcoded copies and import the canonical lists.
