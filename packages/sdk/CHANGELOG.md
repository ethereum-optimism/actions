# @eth-optimism/actions-sdk

## 0.7.0

### Minor Changes

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

- [#430](https://github.com/ethereum-optimism/actions/pull/430) [`afc2b97`](https://github.com/ethereum-optimism/actions/commit/afc2b97e7d83e1ce15c8b51a07d81874e98cd9b9) Thanks [@its-everdred](https://github.com/its-everdred)! - Perf: cut EOA swap dispatch wall-time on fast L2s.
  - `EOAWallet.sendBatch` no longer waits for `confirmations: 2` between sub-txs.
    One inclusion wait per tx is enough now that `EOAWallet.walletClient` attaches
    viem's default `nonceManager` to the signer, which keeps nonces sequential
    locally instead of relying on `eth_getTransactionCount('pending')` on every
    send (avoids races on load-balanced RPCs).
  - `ChainManager` now defaults the viem `pollingInterval` per chain class:
    1000ms for L2-class chains (~1-2s blocks) and 4000ms for L1 mainnet/sepolia
    (~12s blocks). Saves ~3 RPC poll cycles per receipt wait on Base/OP/Unichain.
    This default applies to the public client used by `getPublicClient()` and to
    the public client wrapping the simple bundler client. There is no override
    knob; if a real consumer needs one we'll add it then.

  Behavioural notes for consumers:
  - `sendBatch` is sequential and assumes a sequencer-ordered chain (e.g.
    OP-stack L2s). On reorg-heavy chains, callers should consider an additional
    confirmations pass at the call site.
  - The Velodrome swap path uses **direct ERC-20 max approval** to its universal
    router when `approvalMode: 'max'` is requested — there is no Permit2
    intermediary as on Uniswap. The full allowance persists at the router until
    manually revoked. Continue to scope `approvalMode: 'max'` to demo/testnet
    paths.

- [#424](https://github.com/ethereum-optimism/actions/pull/424) [`cf12b15`](https://github.com/ethereum-optimism/actions/commit/cf12b156df39a3ba16b776253f6df94e93a2df52) Thanks [@its-everdred](https://github.com/its-everdred)! - Export `SWAP_PROVIDER_NAMES`, `LEND_PROVIDER_NAMES`, and `APPROVAL_MODES` runtime constants from the SDK barrel. The existing `SwapProviderName`, `LendProviderName`, and `ApprovalMode` types are now derived from these constants, so adding a new value is a single-line change. Consumers (CLI, custom validators) that need to enumerate names at runtime can drop their hardcoded copies and import the canonical lists.

- [#461](https://github.com/ethereum-optimism/actions/pull/461) [`f288e42`](https://github.com/ethereum-optimism/actions/commit/f288e42c6970f524867a4bb0ce7c3b3a61db6a6d) Thanks [@its-everdred](https://github.com/its-everdred)! - - Drop 2-confirmation wait in `EOAWallet.sendBatch`; attach viem `nonceManager` to the signer.
  - Default viem `pollingInterval` to 1000ms on L2 chains and 4000ms on L1.
  - Export `APPROVAL_MODES`, `LEND_PROVIDER_NAMES`, `SWAP_PROVIDER_NAMES`, and `LEND_ACTIONS` runtime tuples; derive matching types from them.
  - Export `CHAIN_SHORTNAMES`, a canonical `SupportedChainId` → shortname map derived from viem.
  - Barrel-export `ApprovalMode`, `LendProviderName`, and the new `LendAction` literal.
  - Add `getLendMarketAllowlist(lend)` to flatten provider allowlists from a `LendConfig`.
  - Add `Wallet.has(namespace)` capability check for `'lend'` and `'swap'`.
  - Fix Velodrome universal router to use `payerIsUser: true`, resolving `TRANSFER_FAILED` on EOA swaps.
  - Fix Uniswap V4 exact-output single-hop action byte.

## 0.6.0

### Minor Changes

- [#450](https://github.com/ethereum-optimism/actions/pull/450) [`395d75b`](https://github.com/ethereum-optimism/actions/commit/395d75b42d6fcf59697e1b7080fe2bd624912a04) Thanks [@its-everdred](https://github.com/its-everdred)! - Features / API additions

  #451 — Add chainIds param to wallet.getBalance()
  #428 — Configurable approval-amount strategy: callers can now choose between exact-amount and unlimited approvals when opening positions.
  #356 — Wallet refactor: native support for local EOA wallets; the embedded (4337) wallet is now optional rather than required.
  #383 — Shared namespace foundations: reorganizes shared internals to support multiple action domains (lend, borrow, swap) under a common surface.
  #445 — Introduces an ActionsError base class and migrates bare throws across the SDK into named subclasses, giving consumers structured errors to catch.

  Fixes

  #443 — Bug fix in VelodromeProvider impacting EOA swaps, which previously reverted with TRANSFER_FAILED because the encoder always pre-transferred tokens to the router.
  #434 — Bug fix in swap execution where a quote’s recipient did not match the execute call’s recipient; the SDK now rejects the mismatch instead of silently routing funds to the wrong address.
  #441 — Bug fix in UniswapV4Provider affecting exact-output single-hop swaps, which used the wrong action byte and produced invalid calldata.
  #426 — Bug fix in swap execution for calls that omitted a recipient; the SDK now defaults to the wallet address instead of leaving it unset.

  Tooling

  #385 — Bump runtime to Node 22.14.0.
  #372 — Parallelize the test suite.

### Patch Changes

- [#443](https://github.com/ethereum-optimism/actions/pull/443) [`b2682e6`](https://github.com/ethereum-optimism/actions/commit/b2682e6cf9d6bd85233e9227d6660c03f6c885e6) Thanks [@its-everdred](https://github.com/its-everdred)! - Fix Velodrome universal-router approvals for EOA wallets. The encoder previously hardcoded `payerIsUser: false` and pre-`transfer`d tokens to the router, which only works when the caller batches atomically (4337). EOAs (and any sequentially dispatched flow) reverted with `TRANSFER_FAILED`. The router has a first-class `payerIsUser: true` path that pulls tokens via standard `transferFrom`; the SDK now uses it. Behaviorally equivalent for smart wallets, correct for EOAs.

## 0.5.0

### Minor Changes

- [#357](https://github.com/ethereum-optimism/actions/pull/357) [`c49c0ee`](https://github.com/ethereum-optimism/actions/commit/c49c0eec8b3d0035b6eac2040c59455301af35f2) Thanks [@jefr90](https://github.com/jefr90)! - Add ENS name resolution support for recipient addresses.

  Callers can now pass an ENS name (e.g. `"vitalik.eth"`) wherever a recipient address is accepted in `WalletSwapParams` and `SwapQuoteParams`. Hex addresses are unchanged — resolution is a no-op for `0x...` addresses.

  ENS resolution uses `normalize` and `getEnsAddress` from viem (already a core dependency), with no new packages added.

  A mainnet public client (chain ID 1) must be included in the chain configuration to resolve ENS names. A clear error is thrown if mainnet is not configured and an ENS name is passed.

  `EnsName` and `resolveAddress` are also exported from the public SDK API for direct use by callers.

## 0.4.0

### Minor Changes

- [#311](https://github.com/ethereum-optimism/actions/pull/311) [`a1dd54c`](https://github.com/ethereum-optimism/actions/commit/a1dd54c3401dfda4309768f8cb6b11521fe683f0) Thanks [@its-everdred](https://github.com/its-everdred)! - - Add Velodrome/Aerodrome swap provider with v2 AMM and CL/Slipstream pool support across 12 OP Stack chains.
  - Refactor swap interface with flat SwapQuote type, multi-provider quoting (getQuotes, getBestQuote), and SwapSettings configuration.
  - Extract shared ERC20 approval utilities.

### Patch Changes

- [#326](https://github.com/ethereum-optimism/actions/pull/326) [`1016b67`](https://github.com/ethereum-optimism/actions/commit/1016b67a45d543cf1b7633b6e0f9a31223b87025) Thanks [@jefr90](https://github.com/jefr90)! - Add EIP-55 address validation for hardcoded contract addresses and developer-supplied config addresses. Invalid addresses now throw at module load time or SDK initialization with a descriptive error listing all failures.

## 0.3.0

### Minor Changes

- [#284](https://github.com/ethereum-optimism/actions/pull/284) [`93a0250`](https://github.com/ethereum-optimism/actions/commit/93a02502e2c5bfc905eaafdf5fbf5ecfe11ee923) Thanks [@its-everdred](https://github.com/its-everdred)! - Adds support for swapping with Uniswap

## 0.2.0

### Minor Changes

- [#273](https://github.com/ethereum-optimism/actions/pull/273) [`c927f30`](https://github.com/ethereum-optimism/actions/commit/c927f30107b9dd4160f895ec729f1a3320603b3e) Thanks [@its-everdred](https://github.com/its-everdred)! - Improve LendProvider, Asset, Markets

## 0.1.0

### Minor Changes

- [#234](https://github.com/ethereum-optimism/actions/pull/234) [`bd3fdcf`](https://github.com/ethereum-optimism/actions/commit/bd3fdcfbb1e6901dcaaf5ee81e7f5fce2b341dc6) Thanks [@its-everdred](https://github.com/its-everdred)! - - Add Aave LendProvider support
  - Add support for multiple LendProviders

## 0.0.4

### Patch Changes

- [#225](https://github.com/ethereum-optimism/actions/pull/225) [`0487c6b`](https://github.com/ethereum-optimism/actions/commit/0487c6b4b9c6f8fcd024bf6f8aa5c476888aa79b) Thanks [@tremarkley](https://github.com/tremarkley)! - rename actions.wallet.hostedWalletToActionsWallet to actions.wallet.toActionsWallet

- [#240](https://github.com/ethereum-optimism/actions/pull/240) [`21415ef`](https://github.com/ethereum-optimism/actions/commit/21415ef7f023bc30dbc7c77ef69bd622df5f6b1e) Thanks [@its-everdred](https://github.com/its-everdred)! - Improve SDK JSDocs

## 0.0.3

### Patch Changes

- [#187](https://github.com/ethereum-optimism/actions/pull/187) [`7464702`](https://github.com/ethereum-optimism/actions/commit/7464702ff85718f3a1a6825b19164ff8de20e243) Thanks [@tremarkley](https://github.com/tremarkley)! - testing release circleci job
