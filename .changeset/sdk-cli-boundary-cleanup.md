---
'@eth-optimism/actions-sdk': minor
'actions-cli': patch
---

SDK: barrel-export the lend / approval / capability vocabulary that downstream
tooling was reaching past the public API to consume.

- Re-export `ApprovalMode`, `LendProviderName`, and the new `LendAction` literal
  from the package root.
- Add a runtime mirror for each: `APPROVAL_MODES` and `LEND_ACTIONS`.
  `ApprovalMode` and `LendAction` are now derived from these tuples, so the
  type and the runtime list cannot drift.
- Add `CHAIN_SHORTNAMES`, a canonical `Record<SupportedChainId, string>` of
  human-friendly chain shortnames (`base`, `op-sepolia`, ...). Use this as
  the source of truth for `--chain` parsing and any other surface that maps
  user-typed chain strings to a `SupportedChainId`. Adding a new
  `SupportedChainId` requires a corresponding entry here.
- Add `getLendMarketAllowlist(lend)`, which flattens every provider's
  `marketAllowlist` from a `LendConfig` and skips the `settings` sibling.
- Add `Wallet.has(namespace)` capability check for the `lend` and `swap`
  namespaces. Lets callers branch on whether a namespace was registered
  without poking at internal fields.

CLI: drop the local mirrors and reach for the SDK exports instead. Help-text
examples now derive from the resolved config (asset symbols, chain shortnames,
chain ids) rather than hard-coding `USDC_DEMO` / `base-sepolia` / `84532`.
`runLendMarket` passes the resolved `LendMarketConfig` straight through to
`actions.lend.getMarket` instead of rebuilding `{address, chainId}`.
