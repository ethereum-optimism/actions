# Bind pre-built swap/borrow quote dispatch to its calldata bytes (verbatim-signing choke point)

| | |
|---|---|
| **Severity** | high |
| **Complexity** | 5 / 5 |
| **Domain** | core |
| **Surface** | `WalletSwapNamespace` / `WalletBorrowNamespace` dispatch, `SwapProvider.buildSwapTransactions`, `executeTransactionBatch`, `QuoteRecipientMismatchError` |
| **Resolves findings** | F070, F054, F072, F075, F261, F264, F183, F085 |
| **Candidate existing issue** | #373 |
| **Blocked by** | (none) |

>  AUGMENT existing issue #373 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

## Problem

The SDK exposes a documented "get a quote, then hand it back to execute" flow. On that path the wallet namespaces sign whatever bytes the pre-built quote carries. `SwapQuote.execution.{routerAddress,swapCalldata,value}` and `BorrowQuote.execution.transactions[].{to,data,value}` are signed and broadcast **verbatim**, while the only guards that run are on sidecar **metadata** fields (`recipient`, `marketId`, `action`, `expiresAt`, `chainId`). The metadata is never derived from, or reconciled against, the calldata bytes that actually move funds.

A quote is a plain object. Any producer (a cached/relayed quote, a less-trusted preview service, a compromised quote source) can set `recipient = wallet.address` and a real allowlisted `marketId` to pass every check, while the calldata encodes something else entirely:

- a `approve(attacker, maxUint256)` leg on a collateral/input token,
- an `onBehalfOf` / `receiver` / `to` argument pointing at an attacker,
- a `routerAddress` that is not the provider's router for that chain,
- a native `value` unrelated to the quoted `amountIn`.

All of these pass the current guards and are signed. Reachable through the public surface `wallet.swap.execute(quote)` / `wallet.borrow.{openPosition,repay,...}(quote)`. This is the highest-leverage verbatim-signing choke point in the SDK: a single calldata-integrity reconciliation closes a full-wallet-drain vector that the SDK already has every input needed to detect.

## Findings

- **F054** (high, borrow) `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:207-247` - `validateQuoteForThisWallet` checks only recipient/action/expiry/chain/allowlist metadata, then `dispatch()` signs `quote.execution.transactions` verbatim; a malicious `approve(attacker,max)` leg passes all guards.
- **F070** (high, swap) `packages/sdk/src/actions/swap/core/SwapProvider.ts:434-438` (build at `411-415`, validate at `440-451`) - `buildSwapTransactions` copies `routerAddress`/`swapCalldata`/`value` verbatim into the signed tx; only `validateNotZeroAddress(routerAddress)` guards the execution payload, no router-allowlist or calldata re-derive.
- **F075** (low, core-services) `packages/sdk/src/core/error/errors.ts:330-350` - the shared `QuoteRecipientMismatchError` contract documents that routers/protocols bake recipient/`onBehalf` into calldata, yet both consumers compare only the `quote.recipient` metadata field, never the signed bytes (the error-class root of the swap+borrow gap).
- **F072** (medium, wallet-core) `packages/sdk/src/wallet/core/utils/executeTransactionBatch.ts:25-37` - the shared 1-vs-N dispatch helper forwards caller-supplied `TransactionData[]` straight to `wallet.send`/`sendBatch` with zero calldata validation; the borrow leg is the verbatim-quote consumer (lend re-derives, swap re-derives via `provider.execute`).
- **F264** (low, swap) `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts:75-82` - `execute` re-resolves the provider from `quote.provider` and builds Permit2/token approvals from the provider's own router, but nothing asserts `quote.provider` is consistent with `quote.execution.routerAddress`; a `provider='uniswap'` quote with a Velodrome `routerAddress` makes the user sign an approval to a router they never intended.
- **F261** (medium, borrow) `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:220` -> `core/validations.ts:83-102` - the pre-built path gates marketId via `validateBorrowMarketIdInAnyAllowlist` (allowlist-only), silently bypassing the `marketBlocklist` that the re-quote path's `requireAllowlistedBorrowMarketConfig` (`validations.ts:42-76`) enforces; a developer-disabled (blocklisted) but still-allowlisted market is fully dispatchable via a cached quote.
- **F183** (medium, swap, test) `packages/sdk/src/actions/swap/namespaces/__tests__/WalletSwapNamespace.spec.ts:236-327` - the `requireQuoteForThisWallet` suite asserts only `quote.recipient` metadata, never the recipient encoded inside `execution.swapCalldata`; the guard's known no-op on msg.sender/sentinel router paths is untested, so a calldata-vs-metadata mismatch ships green.
- **F085** (low, borrow) `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:178-195` - the raw-params re-quote path spreads `walletAddress: this.wallet.address` and dispatches the freshly built quote with **no** recipient/`onBehalf` conformance check, while the pre-built path runs one; the two paths assert different invariants on the same outgoing calldata.

## Root cause

`quote.recipient` (and `marketId`/`action`/`expiry`/`chainId`) are treated as **trusted proxies** for the calldata, but they are independent sidecar fields on an untrusted, caller-supplied object. The dispatch path never crosses the metadata-to-bytes boundary: it never decodes `execution.transactions[i].data` / `swapCalldata`, never re-derives the canonical router for the quote's chain, and never re-runs the provider builder to compare. `executeTransactionBatch` is the structural choke point all three actions funnel through, but it lacks the action context to reconcile, so the binding must happen in each namespace's validate-before-dispatch step. The guards validate *that a quote claims to be for me*; they never validate *that the bytes I am about to sign do what the quote claims*.

## Recommended approach

Treat the pre-built-quote path as an untrusted-bytes boundary and add a calldata-integrity reconciliation in each namespace before dispatch. The SDK already owns every primitive needed - this is fail-closed-where-the-SDK-already-knows, not intent-guessing.

**Swap (`WalletSwapNamespace` / `SwapProvider.executeFromQuote`):**
1. **Router binding (fixes F070 router leg, F264).** Assert `quote.execution.routerAddress` equals the address the resolved provider derives for `quote.chainId` - `getUniswapAddresses(chainId).universalRouter` (Uniswap) or `getChainConfig(chainId).contracts.router` (Velodrome). These helpers already exist and are used by `_buildApprovals`/`_getQuote`. This simultaneously closes the provider<->routerAddress consistency hole (F264) and gives swap a real router allowlist for in-SDK providers.
2. **Calldata re-derive (fixes F070 calldata leg, F075 swap consumer).** Prefer re-encoding the swap calldata from validated metadata inside `executeFromQuote` and signing the re-encoded bytes, rather than trusting `quote.execution.swapCalldata`. Where full re-encode is impractical for a given route, at minimum decode the recipient out of the calldata (per router/version) and assert it equals `wallet.address`; document the msg.sender-sentinel routes (Uniswap V4 / Velodrome universal+CL) where the recipient is structurally `msg.sender` so the executing wallet IS the recipient.
3. **Value bound (refines:F070 value leg).** Bound `execution.value`: `0` for ERC-20-in, the quoted native `amountInRaw` for native-in.

**Borrow (`WalletBorrowNamespace.validateQuoteForThisWallet`):**
4. **Calldata recipient binding (fixes F054, F075 borrow consumer).** Decode each leg of `execution.transactions` against the known Aave Pool / WETHGateway / Morpho Blue ABIs and assert `to` == the expected contract for that `marketId`+chain and the `onBehalfOf`/`receiver`/`to` argument == `wallet.address` (and the amount matches `borrowAmountRaw`/`collateralAmountRaw`). Alternatively re-run the provider builder from validated `(marketId, action, amounts, wallet)` and compare/replace. Mirror whatever lands for swap.
5. **Blocklist symmetry (fixes F261).** Resolve the quote's `marketId` through `requireAllowlistedBorrowMarketConfig` (which enforces both allowlist AND blocklist) instead of the allowlist-only `validateBorrowMarketIdInAnyAllowlist`, so the pre-built path is symmetric with the re-quote path.
6. **Raw-path conformance (fixes F085).** Run the same recipient/`onBehalf` conformance assertion on the re-quoted result so both the pre-built and raw-params paths enforce the identical "this borrow is bound to my account" invariant before dispatch.

**Shared choke point (F072).** Keep the reconciliation in the namespaces (they hold the action context); `executeTransactionBatch` stays a thin 1-vs-N switch but should be documented as security-relevant rather than a neutral utility. Optionally add a minimal `to !== zeroAddress` / `isAddress(to)` floor there as defense-in-depth, but the load-bearing binding lives in the namespaces.

**Note on borrow health-factor / solvency:** out of scope for this ticket. The borrow receipt's `positionAfter.healthFactor` denormalization and the absent solvency gate are tracked separately (refines:F055, refines:F054 receipt rows); this ticket is strictly calldata-vs-metadata binding, not post-state correctness.

**Tests (F183).** This is the SDK test gap, not demo/CLI. Add unit tests that decode the recipient out of `execution.swapCalldata` / `execution.transactions[].data` and assert it matches `wallet.address`; add a borrow test that allowlists AND blocklists the same marketId, builds a quote, and asserts dispatch throws `MarketNotAllowedError` (parity with the re-quote path). The full sign-and-broadcast coverage (recipient-in-bytes, residual `maxUint256` allowance, quote-aging) belongs to the consolidated Anvil feature-test ticket, not here.

**Demo / CLI:** review-only, no refactor. The CLI's `wallet swap execute --recipient` passthrough (F327, separate ticket #444) rides on these SDK recipient-family bugs; once the SDK binding lands, the CLI should cross-reference it and add only the two cheap review-only guards (strict `isAddress` precheck + echo resolved recipient). Do not re-fix the calldata binding at the CLI layer.

## Affected files

- `packages/sdk/src/actions/swap/core/SwapProvider.ts:411-415,434-438,440-451` - verbatim `routerAddress`/`swapCalldata`/`value` copy; `executeFromQuote` / `validateSwapExecute`.
- `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts:75-82,93-101` - provider resolution from `quote.provider`; `requireQuoteForThisWallet` (recipient-only).
- `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:178-195,207-222,232-247` - raw-path re-quote; `validateQuoteForThisWallet`; verbatim `dispatch`.
- `packages/sdk/src/actions/borrow/core/validations.ts:42-76,83-102` - `requireAllowlistedBorrowMarketConfig` (enforces blocklist) vs `validateBorrowMarketIdInAnyAllowlist` (allowlist-only).
- `packages/sdk/src/wallet/core/utils/executeTransactionBatch.ts:25-37` - shared verbatim 1-vs-N dispatch helper.
- `packages/sdk/src/core/error/errors.ts:330-350` - `QuoteRecipientMismatchError` contract docstring (the metadata-trust invariant to correct/document).
- `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:83,103,111,142,171` - `getUniswapAddresses(chainId).universalRouter` (canonical router for re-derive).
- `packages/sdk/src/actions/swap/providers/velodrome/VelodromeSwapProvider.ts:145,193,212-215` - `getChainConfig(chainId).contracts.router` (canonical router for re-derive).
- `packages/sdk/src/actions/swap/namespaces/__tests__/WalletSwapNamespace.spec.ts:236-327` - metadata-only recipient assertions (F183 test gap).

## Acceptance criteria / tests

- A `SwapQuote` with valid metadata (`recipient = wallet.address`, allowlisted assets) but `execution.routerAddress` not equal to the resolved provider's router for `quote.chainId` is **rejected** before signing.
- A `SwapQuote` with `provider='uniswap'` but `execution.routerAddress` = a Velodrome router is **rejected** (no approval is built to the wrong spender). [F264]
- A `SwapQuote` whose `swapCalldata` encodes a recipient different from `wallet.address` is **rejected** (or the re-encoded calldata is signed instead), with an explicit decode-and-assert test per router/version; msg.sender-sentinel routes are documented and asserted to require the executing wallet == recipient. [F183, F075]
- A `BorrowQuote` whose `execution.transactions` encode an `approve(attacker,max)` / off-account `onBehalfOf` leg is **rejected** before signing, even with correct recipient/marketId/action/expiry metadata. [F054, F075]
- A `BorrowQuote` for a marketId that is both allowlisted and blocklisted is **rejected** with `MarketNotAllowedError` on the pre-built-quote path, matching the re-quote path. [F261]
- The raw-params borrow path runs the same recipient/`onBehalf` conformance assertion as the pre-built path; a quote whose builder mis-threads `walletAddress` into a leg is **rejected**. [F085]
- `execution.value` is bounded: rejected when non-zero for an ERC-20-in swap; bounded to quoted native `amountInRaw` for native-in. [refines:F070]
- All existing swap/borrow execute tests pass; the new tests fail against the current `main` (they encode the binding invariant, not just current behavior).

## Notes

- RPC trust is explicitly out of scope: integrators bring their own RPC; that is a documented assumption, not a fix here. The re-derivation uses static per-chain address config (`getUniswapAddresses` / `getChainConfig`), not an RPC round-trip.
- This is fail-closed-where-the-SDK-already-knows: every assertion uses inputs the SDK already has (chain config, provider builders, known protocol ABIs). It is not refuse-to-sign-everything and not intent-guessing.
- Permit2 / token-approval payloads built from the quote (the `_buildApprovals` leg in F264) are in signing-path scope: a wrong-router quote routes the user's Permit2/token approval to an unintended spender, so the router binding must run before approvals are built.
- The borrow ABI-decode approach is the higher-confidence option (it does not require a second builder run); the provider-rebuild-and-compare approach is the more uniform option (it reuses the exact builder the re-quote path trusts). Pick one per action and apply it consistently across the swap and borrow namespaces (sibling-consistency is part of the scope).
