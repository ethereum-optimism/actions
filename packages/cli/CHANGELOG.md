# actions-cli

## 0.3.0

### Minor Changes

- [#430](https://github.com/ethereum-optimism/actions/pull/430) [`52ba69f`](https://github.com/ethereum-optimism/actions/commit/52ba69fb506f27d63db29bd16b20ef055d555410) Thanks [@its-everdred](https://github.com/its-everdred)! - Add actions-cli package: agent-first CLI for the Actions SDK. Ships scaffolding,
  JSON output pipeline, smart-wallet bootstrap, and smoke commands (`assets`,
  `chains`, `wallet address`, `wallet balance`). Lend and swap namespaces land
  in subsequent PRs.

### Patch Changes

- [#430](https://github.com/ethereum-optimism/actions/pull/430) [`e24b93a`](https://github.com/ethereum-optimism/actions/commit/e24b93a8efd716f06843a41383d037d3316c9cbf) Thanks [@its-everdred](https://github.com/its-everdred)! - SDK: barrel-export the lend / approval / capability vocabulary that downstream
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

- Updated dependencies [[`e24b93a`](https://github.com/ethereum-optimism/actions/commit/e24b93a8efd716f06843a41383d037d3316c9cbf), [`afc2b97`](https://github.com/ethereum-optimism/actions/commit/afc2b97e7d83e1ce15c8b51a07d81874e98cd9b9), [`cf12b15`](https://github.com/ethereum-optimism/actions/commit/cf12b156df39a3ba16b776253f6df94e93a2df52), [`f288e42`](https://github.com/ethereum-optimism/actions/commit/f288e42c6970f524867a4bb0ce7c3b3a61db6a6d)]:
  - @eth-optimism/actions-sdk@0.7.0

## 0.2.0

### Minor Changes

- [#421](https://github.com/ethereum-optimism/actions/pull/421) [`ff23512`](https://github.com/ethereum-optimism/actions/commit/ff235127a30ee86c1cadfba59ddc3cb70cd2ea42) Thanks [@its-everdred](https://github.com/its-everdred)! - Add actions-cli package: agent-first CLI for the Actions SDK. Ships scaffolding,
  JSON output pipeline, smart-wallet bootstrap, and smoke commands (`assets`,
  `chains`, `wallet address`, `wallet balance`). Lend and swap namespaces land
  in subsequent PRs.

### Patch Changes

- Updated dependencies [[`395d75b`](https://github.com/ethereum-optimism/actions/commit/395d75b42d6fcf59697e1b7080fe2bd624912a04), [`b2682e6`](https://github.com/ethereum-optimism/actions/commit/b2682e6cf9d6bd85233e9227d6660c03f6c885e6)]:
  - @eth-optimism/actions-sdk@0.6.0
