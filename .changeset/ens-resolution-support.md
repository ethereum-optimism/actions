---
'@eth-optimism/actions-sdk': minor
---

Add ENS name resolution support for recipient addresses.

Callers can now pass an ENS name (e.g. `"vitalik.eth"`) wherever a recipient address is accepted in `WalletSwapParams` and `SwapQuoteParams`. Hex addresses are unchanged — resolution is a no-op for `0x...` addresses.

ENS resolution uses `normalize` and `getEnsAddress` from viem (already a core dependency), with no new packages added.

A mainnet public client (chain ID 1) must be included in the chain configuration to resolve ENS names. A clear error is thrown if mainnet is not configured and an ENS name is passed.

`EnsName` and `resolveAddress` are also exported from the public SDK API for direct use by callers.
