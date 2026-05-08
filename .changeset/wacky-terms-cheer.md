---
'@eth-optimism/actions-sdk': minor
---

- Drop 2-confirmation wait in `EOAWallet.sendBatch`; attach viem `nonceManager` to the signer.
- Default viem `pollingInterval` to 1000ms on L2 chains and 4000ms on L1.
- Export `APPROVAL_MODES`, `LEND_PROVIDER_NAMES`, `SWAP_PROVIDER_NAMES`, and `LEND_ACTIONS` runtime tuples; derive matching types from them.
- Export `CHAIN_SHORTNAMES`, a canonical `SupportedChainId` → shortname map derived from viem.
- Barrel-export `ApprovalMode`, `LendProviderName`, and the new `LendAction` literal.
- Add `getLendMarketAllowlist(lend)` to flatten provider allowlists from a `LendConfig`.
- Add `Wallet.has(namespace)` capability check for `'lend'` and `'swap'`.
- Fix Velodrome universal router to use `payerIsUser: true`, resolving `TRANSFER_FAILED` on EOA swaps.
- Fix Uniswap V4 exact-output single-hop action byte.
