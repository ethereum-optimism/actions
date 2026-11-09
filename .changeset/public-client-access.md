---
'@eth-optimism/actions-sdk': minor
---

Expose `Actions.getPublicClient(chainId)` so callers can reuse the public client built from `ActionsConfig.chains` (RPC URLs, fallback transport, and polling interval) instead of calling `createPublicClient` again. Throws `ChainNotSupportedError` when the chain is not configured.
