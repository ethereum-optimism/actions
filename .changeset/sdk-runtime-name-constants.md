---
'@eth-optimism/actions-sdk': minor
---

Export `SWAP_PROVIDER_NAMES`, `LEND_PROVIDER_NAMES`, and `APPROVAL_MODES` runtime constants from the SDK barrel. The existing `SwapProviderName`, `LendProviderName`, and `ApprovalMode` types are now derived from these constants, so adding a new value is a single-line change. Consumers (CLI, custom validators) that need to enumerate names at runtime can drop their hardcoded copies and import the canonical lists.
