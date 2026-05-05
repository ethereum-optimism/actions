# @eth-optimism/actions-sdk

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
