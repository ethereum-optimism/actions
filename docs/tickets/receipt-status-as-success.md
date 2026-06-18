# Fail closed on reverted-but-mined receipts in send/sendBatch (EOA + smart)

>  AUGMENT existing issue #474 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| Field | Value |
| --- | --- |
| Severity | high |
| Complexity | 3 (1-5) |
| Domain | wallet |
| Surface | `EOAWallet.send/sendBatch`, `DefaultSmartWallet.send/sendBatch`, all three action dispatch envelopes (lend/swap/borrow) |
| Resolves findings | F020, F034, F021, F212 |
| Candidate existing issue | #474 (Retrofit lend/swap error handling to named errors + mapSdkError + global onError) |
| Blocked by | (none) |

Issue #474 already owns "retrofit to named errors". The fix here is exactly that pattern: route a confirmed-but-reverted receipt through the existing `TransactionConfirmedButRevertedError` named error instead of returning it as a success. Fold this gate into #474 and treat it as a fund-safety priority within that work.

## Problem

A transaction (EOA tx or ERC-4337 UserOp) can be **mined / confirmed yet revert**. Both wallet implementations currently return that receipt verbatim from `send`/`sendBatch` without inspecting the success field, so the SDK reports a reverted action as a completed one.

This is a fail-open on data the SDK already holds:

- The EOA receipt carries `status: 'success' | 'reverted'` (`EOATransactionReceipt`, `packages/sdk/src/wallet/core/wallets/abstract/types/index.ts:9-13`).
- The smart-wallet UserOp receipt carries `success: boolean` (`WaitForUserOperationReceiptReturnType`).

Both fields are read and acted on by the rotation/deploy siblings, but never by the user-facing `send`/`sendBatch`. The reverted receipt then flows up through `executeTransactionBatch` into every action namespace's dispatch envelope, where it is denormalized into a `BorrowReceipt` / `LendTransactionReceipt` / `SwapReceipt` with `positionAfter`, `borrowAmount`, etc. all taken from the **quote** (not from chain). The integrator receives a real on-chain hash plus quote-derived "after" state and reasonably treats the lend/swap/borrow as done.

Fund-safety framing:

- **EOA `sendBatch` mid-batch revert (F021).** For an EOA, `sendBatch` signs and submits each tx sequentially with no atomicity. If a max-mode ERC-20 approval lands and the following position call reverts, the wallet is left holding a standing (potentially infinite) residual allowance with no deposit, and `sendBatch` returns the array as success. The smart-wallet sibling executes the same `[approval, position]` as one atomic UserOp, so the same code path gives two different safety guarantees purely by wallet type.
- **Silent revert across all three success envelopes (F212).** A reverted-but-mined UserOp (out-of-gas inner call, slippage revert) surfaces its `userOpHash` and quote-derived `positionAfter` as a completed action to lend, swap, and borrow dispatch.

## Findings

- **F020** (`packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-73`): `EOAWallet.send` returns the receipt from `waitForTransactionReceipt` with no `receipt.status` check, so a reverted EOA tx is returned as success.
- **F021** (`packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:90-100`): `EOAWallet.sendBatch` loops `send()` per tx and pushes each receipt without inspecting status; a mid-batch revert after a max-mode approval leaves a residual allowance reported as success (smart sibling is atomic + throws).
- **F034 / F212** (`packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:217-250, 261-294`): `DefaultSmartWallet.send` and `sendBatch` return `waitForUserOperationReceipt` verbatim and never assert `receipt.success`; only `deploy` (`:486`), `addSigner` (`:350-357`), and `removeSigner` (`:414-419`) check it. A `success:false` UserOp is reported as a successful send to every namespace dispatch.

## Root cause

The success/revert gate that the rotation siblings already apply is missing on the two methods every action path actually uses. `addSigner`, `removeSigner`, and `deploy` destructure the receipt and throw `TransactionConfirmedButRevertedError` (or `SmartWalletDeploymentError`) on `!success`. `send`/`sendBatch` skip that check on both the EOA and smart implementations, and the shared `executeTransactionBatch` router (`packages/sdk/src/wallet/core/utils/executeTransactionBatch.ts:25-37`) forwards whatever they return. The action envelopes (lend/swap/borrow dispatch) then unconditionally build a success receipt on top. The result is a cross-implementation contract gap: `Wallet.send`'s success contract means revert-as-error on smart wallets and revert-as-success on EOAs.

## Recommended approach

Fail closed in the wallet layer, reusing the existing named error so this lands cleanly inside #474.

1. **EOA (`EOAWallet.ts`).** In `send`, after `waitForTransactionReceipt`, throw `TransactionConfirmedButRevertedError(message, receipt)` when `receipt.status === 'reverted'`; return the receipt otherwise. `sendBatch` inherits the gate for free because it calls `send()` per tx, so a mid-batch revert throws before signing the next leg (F021). The error class already accepts a viem `TransactionReceipt` (`packages/sdk/src/wallet/core/error/errors.ts:12-29`), so no new type is needed.
2. **Smart (`DefaultSmartWallet.ts`).** In `send` and `sendBatch`, after `waitForUserOperationReceipt`, throw `TransactionConfirmedButRevertedError(message, receipt.receipt)` when `!receipt.success` (the same `{ success, receipt }` shape `addSigner`/`removeSigner` already destructure), then return. This makes the user-facing methods match the deploy/rotation contract.
3. **Action envelopes (lend/swap/borrow dispatch).** No envelope change required: once `send`/`sendBatch` throw on revert, `executeTransactionBatch` propagates, and the dispatch methods (`WalletBorrowNamespace.dispatch` `:232-247`, `WalletLendNamespace.dispatch` `:89-98`, `WalletSwapNamespace.dispatch` `:142-154`) never build a success envelope on a reverted receipt. Confirm by test rather than by editing each envelope, keeping this a surgical wallet-layer fix.

Consistency note (sibling parity): this brings `send`/`sendBatch` in line with `deploy`/`addSigner`/`removeSigner`, which already fail closed on the identical signal. No new behavior is invented; the gate the SDK already applies in three places is extended to the two methods every action uses.

Out of scope (per scope rules): no RPC-trust hardening (a confirmed receipt is taken at face value; integrators bring their own RPC), no intent-guessing, no broad refuse-to-sign. This is strictly the obvious missing revert check on data already in hand.

## Affected files

- `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-73` (`send` — add `status === 'reverted'` gate)
- `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:90-100` (`sendBatch` — inherits gate via `send`)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:261-294` (`send` — add `!receipt.success` gate)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:217-250` (`sendBatch` — add `!receipt.success` gate)
- `packages/sdk/src/wallet/core/error/errors.ts:12-29` (`TransactionConfirmedButRevertedError` — reused, no change)
- `packages/sdk/src/wallet/core/utils/executeTransactionBatch.ts:25-37` (router — no change; propagates the throw)
- `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:232-247` (dispatch — no change; verified by test)
- `packages/sdk/src/actions/lend/namespaces/WalletLendNamespace.ts:89-98` (dispatch — no change; verified by test)
- `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts:142-154` (dispatch — no change; verified by test)

Test files to extend (the negative-path coverage these findings flag as missing — F211/F238 record the same gap on the test side):

- `packages/sdk/src/wallet/core/wallets/eoa/__tests__/EOAWallet.spec.ts`
- `packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts`

## Acceptance criteria / tests

- `EOAWallet.send` throws `TransactionConfirmedButRevertedError` when `waitForTransactionReceipt` resolves `status: 'reverted'`, and returns the receipt unchanged when `status: 'success'`.
- `EOAWallet.sendBatch` stops on the first reverted leg: given `[approval (success), position (reverted)]`, it throws and does **not** call `sendTransaction` for any tx after the reverted one (asserts no further signing — the F021 residual-allowance hazard).
- `DefaultSmartWallet.send` and `sendBatch` throw `TransactionConfirmedButRevertedError` when `waitForUserOperationReceipt` resolves `{ success: false, receipt }`, and return the receipt when `{ success: true }`.
- A namespace-level test for each of lend, swap, and borrow asserts that a reverted underlying receipt makes `dispatch` reject (no `LendTransactionReceipt` / `SwapReceipt` / `BorrowReceipt` with quote-derived `positionAfter` is returned on a revert) — closes F212's "leaks into all three success envelopes".
- Existing success-path tests still pass (the success branch returns the receipt unchanged).
- The thrown error carries the underlying receipt (transactionHash / userOp receipt) so callers can post-mortem.

## Notes

- Real on-chain proof of the revert-as-success path (funded wallet, signed, broadcast, read-back) belongs to the single consolidated Anvil feature-test ticket; the unit tests above mock `waitForTransactionReceipt` / `waitForUserOperationReceipt` to return reverted receipts, which is sufficient to lock the contract for this fix. F211 and F238 are the test-debt twins and are satisfied by the negative tests added here.
- A backend-boundary twin exists: `mintDemoUsdcToWallet` (`packages/demo/backend/src/services/wallet.ts:117-158`, F287) discards the UserOp success flag and returns `{ success: true }` unconditionally. That is a separate demo/backend locus and is review-only (no refactor); it is not fixed by this SDK ticket, but once the SDK fails closed, a reverted mint will throw rather than silently return 200, which removes part of the hazard.
- The smart-wallet `send`/`sendBatch` currently wrap their body in a try/catch that rethrows as a generic `Error`. Throw the `TransactionConfirmedButRevertedError` so it is not swallowed/reshaped into a generic message — i.e. add the success check after the try/catch returns, or let the named error propagate. Match the existing rotation-method shape (`{ success, receipt } = await this.sendBatch(...)`, then `if (!success) throw`).
