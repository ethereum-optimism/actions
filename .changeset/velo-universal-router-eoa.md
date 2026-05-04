---
'@eth-optimism/actions-sdk': patch
---

Fix Velodrome universal-router approvals for EOA wallets. The encoder previously hardcoded `payerIsUser: false` and pre-`transfer`d tokens to the router, which only works when the caller batches atomically (4337). EOAs (and any sequentially dispatched flow) reverted with `TRANSFER_FAILED`. The router has a first-class `payerIsUser: true` path that pulls tokens via standard `transferFrom`; the SDK now uses it. Behaviorally equivalent for smart wallets, correct for EOAs.
