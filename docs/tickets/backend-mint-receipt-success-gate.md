# Gate demo mint on UserOp receipt.success instead of returning unconditional 200

| Field | Value |
| --- | --- |
| Severity | medium |
| Complexity | 2 (1-5) |
| Domain | backend |
| Surface | `services/wallet.ts` `mintDemoUsdcToWallet` (returns `{ success: true }`), `controllers/wallet.ts` `getLendPosition` 500-vs-404 |
| Resolves findings | F287, F289 |
| Candidate existing issue | none |
| Blocked by | (none) |

This is a demo/backend ticket and is **review-only**: low-risk response-shaping fixes mirroring sibling handlers, no architectural refactor. Both findings are corrected by branching on data the backend already holds, matching an adjacent handler line-for-line.

## Problem

Two demo-backend response-shaping handlers report the wrong outcome on data they already hold, and each contradicts a sibling handler that gets it right.

- **Reverted mint reported as success (F287).** `mintDemoUsdcToWallet` awaits a sponsored UserOp (`wallet.sendBatch` via `mintUsdcDemo`) whose receipt carries a boolean `success` field. A mined-but-reverted UserOp resolves with `success: false` rather than throwing. The service never reads that flag: it pulls out only the transaction/userOp hashes and returns `{ success: true, amount: '100', userOpHash, blockExplorerUrls }` unconditionally. So a demo-USDC mint that reverted on chain is reported to the UI as HTTP 200 with `success: true`, a real `userOpHash`, and a block-explorer link, while no USDC was actually minted. The sibling faucet drip path under the same revert returns 500 (`controllers/wallet.ts:172` `if (!result.success)`). USDC_DEMO is a permissionless mock token, so there is no protocol fund loss, but the client is told a no-op mint succeeded.

- **Missing wallet labeled 500 instead of 404 (F289).** `getLendPosition` throws a bare `Error('Wallet not found')` from a handler with no try/catch, so it propagates to the global `app.onError`; `mapSdkError` does not recognize a plain `Error` and falls through to a generic `Internal server error` 500. The directly adjacent `getBorrowPosition` and `getWallet` return `errorResponse(c, 'Wallet not found', 404)` for the identical missing-wallet condition. A missing embedded wallet is a client-state 404, not a server fault; mislabeling it as a 500 pollutes error monitoring and can mask real 500s.

Fund-safety framing: neither finding moves protocol funds (demo mock token; read-only position lookup). The hazard is correctness and trust signaling: the backend tells the client an action succeeded when it did not (F287), and mislabels a client condition as a server failure (F289). The fix in both cases is to branch on a flag/value already in hand, mirroring a sibling.

## Findings

- **F287** (`packages/demo/backend/src/services/wallet.ts:117-158`): `mintDemoUsdcToWallet` extracts hashes from the `sendBatch` result (`:131-142`) but never reads its `success` flag, returning `{ success: true, ... }` at `:150-157` unconditionally; a reverted mint reports HTTP 200 success. Backend-boundary twin of F212 (the SDK not asserting `receipt.success` in `send`/`sendBatch`).
- **F289** (`packages/demo/backend/src/controllers/wallet.ts:99-102,123-126`): `getLendPosition` does `throw new Error('Wallet not found')` (`:100-102`) which surfaces as a generic 500, while sibling `getBorrowPosition` returns `errorResponse(c, 'Wallet not found', 404)` (`:124-126`) and `getWallet` returns 404 (`:52`) for the same condition.

## Root cause

Both handlers skip a check their own sibling already performs.

- F287: the service discards the success flag the SDK already resolved into the receipt. The faucet sibling (`controllers/wallet.ts:172`) reads `result.success` and 500s on false; this handler does not, so it shapes a fixed `success: true` envelope regardless of the on-chain outcome. This is the demo-boundary expression of the same fail-open as F212/#474 in the SDK.
- F289: a divergent error-shaping convention inside one file. `getBorrowPosition`/`getWallet` return a structured 404 via `errorResponse`; `getLendPosition` throws a bare `Error` that the global `mapSdkError` cannot classify, so it defaults to 500.

## Recommended approach

Review-only, no refactor. Each fix is a few lines that copy the shape of an adjacent handler; do not restructure the controllers or service.

1. **F287 (`services/wallet.ts`).** Before returning, branch on the UserOp receipt's `success` flag for the `userOpHash` path (the `else if ('userOpHash' in result)` branch, `:138-139`), mirroring the faucet controller's `if (!result.success)` guard. When the mint UserOp reverted (`success === false`), surface a failure (`success: false` / let the controller map it to a 500) instead of returning a fixed `success: true`. Keep the `EOATransactionReceipt` array branch (`:134-137`) and the single-receipt `else` branch (`:140-142`) as-is; if they ever carry a `status: 'reverted'`, that is the SDK's `send`/`sendBatch` gate to fix in #474, not this backend ticket. The `mintDemoUsdcToWallet` controller (`controllers/wallet.ts:138-153`) already wraps the call in try/catch and returns 500 on error, so a service-side throw or a `success: false` it can inspect both land as a non-200 cleanly.

2. **F289 (`controllers/wallet.ts`).** In `getLendPosition`, replace `throw new Error('Wallet not found')` (`:100-102`) with `return errorResponse(c, 'Wallet not found', 404)`, matching `getBorrowPosition` (`:124-126`) and `getWallet` (`:52`). No other change.

Scope notes:
- This does not depend on the SDK fix, but interacts with it: once `receipt-status-as-success.md` (folded into #474) makes `DefaultSmartWallet.sendBatch` throw on a reverted UserOp, the F287 mint path will throw before reaching the unconditional return, defusing most of the hazard from the SDK side. The backend gate here is still the correct, independent fix: it keeps the demo backend honest regardless of SDK timing, and it is the locus the review flagged as a backend response-shaping inconsistency distinct from the SDK-internal F212.
- No RPC-trust hardening, no intent-guessing, no broad refuse-to-sign. Both changes act only on values the backend already has (the receipt `success` flag; the resolved-wallet null check).

## Affected files

- `packages/demo/backend/src/services/wallet.ts:117-158` (`mintDemoUsdcToWallet` — branch on UserOp `result.success` before returning; F287)
- `packages/demo/backend/src/controllers/wallet.ts:99-102` (`getLendPosition` — return 404 instead of throwing bare Error; F289)
- `packages/demo/backend/src/controllers/wallet.ts:124-126` (`getBorrowPosition` — reference for the 404 shape; no change)
- `packages/demo/backend/src/controllers/wallet.ts:172` (faucet `dripEthToWallet` — reference for the `if (!result.success)` 500 gate; no change)
- `packages/demo/backend/src/services/usdcDemo.ts:21-34` (`mintUsdcDemo` — returns `SmartWallet['sendBatch']` result carrying `success`; no change)

## Acceptance criteria / tests

- A demo-USDC mint whose UserOp resolves `{ success: false }` no longer returns HTTP 200 with `success: true`; `mintDemoUsdcToWallet` surfaces a failure (service throws or returns `success: false`) and the controller maps it to a non-200, matching the faucet drip path under the same revert.
- A demo-USDC mint whose UserOp resolves `{ success: true }` returns the existing successful envelope unchanged (`success: true`, `amount: '100'`, `userOpHash`, `blockExplorerUrls`).
- The `EOATransactionReceipt` array branch and the single-receipt `else` branch return the same shape as today (no behavior change to the EOA paths).
- `getLendPosition` for an authenticated user with no embedded wallet returns HTTP 404 `'Wallet not found'`, identical to `getBorrowPosition` and `getWallet` under the same condition (no longer a generic 500).
- `getLendPosition` success path (wallet present) is unchanged.

## Notes

- Backend-boundary twin of F212. The SDK-side fail-closed fix lives in `docs/tickets/receipt-status-as-success.md` (folded into #474); that ticket's Notes already cross-reference this F287 locus as a separate, review-only demo backend fix. The two are complementary, not duplicates: #474 makes the SDK throw on a reverted send; this ticket makes the demo backend honest about the success flag it shapes into its response.
- Real on-chain proof of the reverted-mint path (forced revert, read-back) belongs to the single consolidated Anvil feature-test ticket; a unit test that stubs `mintUsdcDemo` / `sendBatch` to return a `{ success: false }` receipt is sufficient to lock the F287 contract here.
- F288 (auth-ordering on the same two position handlers) is a separate finding and is not in scope for this ticket.
