# Reconcile the frontend Aave USDC_DEMO mirror (success flag, over-removal cap, idempotency)

| Field | Value |
| --- | --- |
| Severity | low |
| Complexity | 2 (1-5) |
| Domain | frontend |
| Surface | `demoMagic/aaveDemoMagic.ts` `mirrorBorrowReceipt`/`sendMirrorTx`, `api/actionsApi.ts` mutation idempotency |
| Resolves findings | F308, F309 |
| Candidate existing issue | none |
| Blocked by | (none) |

This is a demo-frontend ticket and is **review-only**: low-risk fund-state-correctness fixes on a permissionless mock token, no architectural refactor. Each fix branches on a value the code already has in hand (the UserOp success flag the SDK already resolved, the wallet's current USDC_DEMO balance, a client-generated key) and mirrors the gate a sibling path already performs.

## Problem

The Aave borrow demo "magic" keeps an in-browser USDC_DEMO balance in sync with a real on-chain USDC borrow/repay: it mints USDC_DEMO on borrow and transfers it to a dead sink on repay (`aaveDemoMagic.ts:1`, `34-47`). Three correctness gaps let the displayed (mirrored) balance drift away from the real position while the UI reports the action as cleanly Confirmed. No protocol funds move (USDC_DEMO is a permissionless testnet mock), but the demo misrepresents fund state, and the repay gate that decides whether the user can repay reads that drifted balance.

- **Failed mirror shows Confirmed, balance never updates (F308).** `frontendWalletOperations` returns the real borrow/repay receipt immediately and fires the mirror as `void mirrorBorrowReceipt(...)` (`frontendWalletOperations.ts:152-153,157-158,166-167`). `mirrorBorrowReceipt` in turn does `void (mint|remove)MirrorUsdcDemo(...)` (`aaveDemoMagic.ts:44-46`), a second un-awaited `sendBatch` whose outcome is read only through a try/catch that `console.error`s a thrown rejection (`sendMirrorTx`, `aaveDemoMagic.ts:80-88`). `sendBatch` resolves to a `BatchTransactionReturnType` that already carries the on-chain outcome (`success: boolean` for the UserOp path, `status: 'success'|'reverted'` for the EOA path), but the mirror never reads it. So a mined-but-reverted mirror UserOp resolves normally, the borrow/repay reports success, the activity log confirms, and the user's USDC_DEMO balance silently never changes.

- **Retry double-mirrors (F308).** There is no idempotency key on the mirror, so a client-side retry of the same borrow runs `mintMirrorUsdcDemo` twice and mints USDC_DEMO twice for one real debt; a retried close removes twice.

- **Full close over-removes and reverts (F309 / refines F308).** On borrow, the mirror mints `receipt.borrowAmount = quote.borrowAmountRaw` (the principal). On a full close/repay the same `receipt.borrowAmount` is passed as the remove amount, but for an Aave close that field is `repay.repayAmount` = the full outstanding debt **including accrued interest** (`aave/quote.ts:278`). Only the principal was ever minted, so once interest accrues the remove `transfer` (`aaveDemoMagic.ts:67-72`) requests more USDC_DEMO than the wallet holds and reverts. The revert is swallowed (the F308 fire-and-forget path), so the real close shows Confirmed while stale USDC_DEMO lingers.

Fund-safety framing: no protocol fund loss (mock token, testnet). The hazard is trust signaling and fund-state correctness. The mirror tells the user an action succeeded and a balance is present when the mirror actually failed (F308), or leaves a phantom balance after a successful close (F309). The repay gate (`repayGateAsset` → USDC_DEMO balance, `BorrowAction.tsx:109,117,121`) then makes the repay decision against that drifted balance: a failed mint after a real borrow shows "You need USDC to repay this loan" with no hint the mirror failed, and lingering post-close balance reads as repayable phantom funds.

## Findings

- **F308** (`packages/demo/frontend/src/demoMagic/aaveDemoMagic.ts:34-89`): `mirrorBorrowReceipt` is invoked as `void` from `frontendWalletOperations.ts:152-153,157-158,166-167` and internally `void`s the mint/remove (`:44-46`); `sendMirrorTx` (`:53-89`) awaits `sendBatch` but discards its `BatchTransactionReturnType` and only `console.error`s a thrown rejection (`:80-88`), never reading the resolved `success`/`status` flag, and carries no idempotency key. A reverted mirror reports success while USDC_DEMO never updates; a retry double-mirrors. User-visible frontend twin of backend F292.
- **F309** (over-removal arithmetic, refines F308; `packages/demo/frontend/src/demoMagic/aaveDemoMagic.ts:44-71`): on a full close the remove amount is `receipt.borrowAmount`, which for an Aave close is `repay.repayAmount` = full outstanding debt incl. accrued interest (`packages/sdk/src/actions/borrow/providers/aave/quote.ts:278`); only principal was minted, so the `transfer` at `aaveDemoMagic.ts:67-72` over-withdraws and reverts (swallowed), leaving stale USDC_DEMO that the repay gate reads as phantom funds.
- **F309** (client idempotency, `packages/demo/frontend/src/api/actionsApi.ts:108-127,236-289`): `lendMutation` and `executeSwap` (and `borrowApi.postMutation`, `borrowApi.ts:133-153`) POST fund-moving actions with no client idempotency key; React Query in-flight flags cover double-clicks, but `MUTATION_TIMEOUT_MS=30s` `AbortSignal.timeout` (`apiClient.ts:21,33`) aborts a slow-but-successful mutation client-side, so a caller retry or reload + re-submit re-executes with no server-side dedup.

## Root cause

Each path skips a guard it already has the data to perform.

- **F308 success flag:** the mirror discards the outcome the SDK already resolved into `sendBatch`'s return. `BatchTransactionReturnType` (`packages/sdk/src/wallet/core/wallets/abstract/types/index.ts:40-42`) is `EOATransactionReceipt[]` (each `status: 'success'|'reverted'`) or `UserOperationTransactionReceipt` (`success: boolean`). The mirror treats only a thrown rejection as failure; a mined-but-reverted UserOp resolves normally and is reported as settled. This is the user-visible frontend expression of the same fail-open as backend F292/F287.
- **F309 over-removal:** the mirror reuses one field (`receipt.borrowAmount`) for two different quantities. On open it is the minted principal; on close the SDK sets `borrowAmountRaw: repay.repayAmount` (`aave/quote.ts:278`) = principal + accrued interest. Removing the close-side value against a balance that was only ever the principal is arithmetically guaranteed to over-withdraw once any interest accrues.
- **F309 idempotency:** no client-generated key is threaded through the mutation POSTs, so the only dedup is the in-flight UI flag, which does not survive the `AbortSignal.timeout` abort + retry window or a reload.

## Recommended approach

Review-only, no refactor. All three changes act on values already in hand and keep the existing best-effort, non-blocking UX; the mirror stays fire-and-forget from the borrow/repay caller's perspective, it just stops misreporting.

1. **F308 — read the success flag (`aaveDemoMagic.ts` `sendMirrorTx`).** Read the resolved `sendBatch` return and treat a reverted UserOp (`success === false`) or reverted EOA leg (`status === 'reverted'`) as a mirror failure, the same way the success/throw paths already diverge. Surface that failure where the user can see the balance did not move (the existing `console.error` plus a non-blocking activity-log/toast entry, or a `dispatchEarnPositionsChanged` that re-reads on-chain so the UI reflects the true balance rather than an assumed mint). Do not make the borrow/repay caller block on or fail from the mirror; the goal is to stop presenting a failed mirror as clean success, not to gate the real action on the demo twin.

2. **F309 over-removal — cap the remove amount (`aaveDemoMagic.ts` remove path).** Before encoding the `transfer` (`:67-72`), read the wallet's current USDC_DEMO balance and remove `min(receipt.borrowAmount, balance)`. A full close after interest accrual then zeroes the twin instead of over-withdrawing and reverting. Demo-only; no SDK change. (Cap, do not also try to mirror the accrued-interest delta: the twin tracks principal, and the cap is the minimal fix that keeps a full close from reverting.)

3. **F309 idempotency — thread a client key (`actionsApi.ts`/`borrowApi.ts` mutation POSTs + the mirror).** Generate a client idempotency key per fund-moving submission and send it on `lendMutation`/`executeSwap`/`borrowApi.postMutation` (and key the mirror mint/remove on the borrow receipt's tx/userOp hash so a retry of the same borrow does not double-mirror). Note honoring the key server-side is the backend half (tracked alongside F292/the backend mirror); the client key is the demo-frontend piece here. This closes the 30s timeout-abort + retry double-submit window without touching the in-flight UI guards.

Scope notes:
- No RPC-trust hardening, no intent-guessing, no broad refuse-to-sign. The success-flag read is fail-closed-where-the-SDK-already-knows (the flag is already resolved into the return value); the cap and the idempotency key are obvious-validation/consistency fixes mirroring the backend mirror and the sibling success gates.
- Cross-references the backend mirror (F292) and the backend mint success gate (`docs/tickets/backend-mint-receipt-success-gate.md`, F287): this ticket is the frontend twin. The client idempotency key pairs with server-side dedup tracked on the backend side; not a blocker here.

## Affected files

- `packages/demo/frontend/src/demoMagic/aaveDemoMagic.ts:34-47` (`mirrorBorrowReceipt` — invoked as `void`, fans out to `void` mint/remove; idempotency key entry point)
- `packages/demo/frontend/src/demoMagic/aaveDemoMagic.ts:53-89` (`sendMirrorTx` — awaits `sendBatch` but discards the resolved success/status; only `console.error`s a thrown rejection)
- `packages/demo/frontend/src/demoMagic/aaveDemoMagic.ts:67-72` (remove `transfer` encode — cap amount at `min(receipt.borrowAmount, balance)`)
- `packages/demo/frontend/src/components/earn/frontendWalletOperations.ts:152-153,157-158,166-167` (mirror call sites — pass the borrow/repay receipt; reference for keying the idempotency token off the receipt hash)
- `packages/demo/frontend/src/components/earn/BorrowAction.tsx:109,117,121` (`repayGateAsset` → USDC_DEMO balance the gate reads; reference, no change)
- `packages/demo/frontend/src/api/actionsApi.ts:108-127` (`lendMutation` POST — thread client idempotency key)
- `packages/demo/frontend/src/api/actionsApi.ts:236-289` (`executeSwap` POST — thread client idempotency key)
- `packages/demo/frontend/src/api/borrowApi.ts:133-153` (`postMutation` POST — same key, sibling path)
- `packages/demo/frontend/src/api/apiClient.ts:21,33` (`MUTATION_TIMEOUT_MS=30s` `AbortSignal.timeout` — the abort that opens the retry window; reference)
- `packages/sdk/src/actions/borrow/providers/aave/quote.ts:278` (`borrowAmountRaw: repay.repayAmount` — close-side amount = principal + accrued interest; reference, no change)
- `packages/sdk/src/wallet/core/wallets/abstract/types/index.ts:40-42` (`BatchTransactionReturnType` — carries the `success`/`status` flag the mirror discards; reference, no change)

## Acceptance criteria / tests

- A mirror `sendBatch` that resolves a reverted outcome (UserOp `success: false`, or an EOA receipt `status: 'reverted'`) is no longer treated as settled: the mirror does not emit a settled log and the UI does not present the failed mirror as a clean balance update (it surfaces the failure and/or re-reads the true on-chain balance). A successful mirror is unchanged.
- After a full Aave close/repay where accrued interest makes `receipt.borrowAmount` exceed the wallet's current USDC_DEMO balance, the remove `transfer` is encoded for `min(receipt.borrowAmount, balance)` and does not revert; the USDC_DEMO twin is zeroed.
- A close/repay whose `receipt.borrowAmount` is within the wallet's balance removes the full `receipt.borrowAmount` (no behavior change to the non-accrued path).
- A retried borrow with the same client idempotency key does not double-mirror (mint runs once for one real borrow); `lendMutation`/`executeSwap`/`borrowApi.postMutation` carry the key on the POST.
- Unit tests stub `sendBatch` to return a `{ success: false }` UserOp receipt (F308) and a balance below `receipt.borrowAmount` (F309 cap) to lock both contracts; the in-flight UI guards and the borrow/repay caller's success path are unchanged.

## Notes

- User-visible frontend twin of backend F292 (the `mirror.ts` fire-and-forget mirror) and a sibling of `docs/tickets/backend-mint-receipt-success-gate.md` (F287, the backend mint success gate). The success-flag read here mirrors the faucet/mint gate logic those tickets apply on the backend.
- The F309 over-removal arithmetic refines F308: same fire-and-forget mirror, made concrete by the principal-vs-(principal+interest) mismatch between the mint and remove legs.
- Real on-chain proof (forced mirror revert, interest-accrual over-removal, timeout-retry double-submit) belongs to the single consolidated Anvil feature-test ticket; stubbed-receipt/stubbed-balance unit tests are sufficient to lock the contracts here.
- Client idempotency keys close the double-submit window only when honored server-side; the server-side dedup is the backend half (tracked alongside F292) and is not a blocker for landing the client-side key and the two mirror fixes.
- Out of scope: the partial-repay advisory-text float formatting (F326) and the lend/Morpho config drift (F316) are separate frontend findings, not part of this mirror reconcile.
