# Stop EOA sendBatch from continuing after a mid-batch revert (residual max allowance)

> **AUGMENT existing issue #335 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| | |
|---|---|
| **Severity** | high |
| **Complexity** | 3 / 5 |
| **Domain** | wallet |
| **Surface** | `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:90-100` (sendBatch); `packages/sdk/src/actions/lend/namespaces/WalletLendNamespace.ts:89-98` (dispatch `[approval, position]`) |
| **Resolves findings** | F021, F027 |
| **Candidate existing issue** | #335 |
| **Blocked by** | _(none)_ |

## Problem

When the wallet is an EOA / `LocalWallet`, a lend/swap/borrow flow that needs an ERC-20 approval is dispatched as an ordered batch `[approval, position]`. `EOAWallet.sendBatch` sends these as independent signed transactions, each awaited to inclusion, and **keeps going after a mid-batch revert** because neither `send()` nor `sendBatch()` ever inspects `receipt.status`.

The fund-safety failure mode is the max-mode approval case: the approval leg lands first and grants a standing (often infinite / max) allowance to the lend/swap/borrow contract, then the position leg reverts on-chain (slippage, cap, transferFrom precondition). `sendBatch` does not abort. It returns a full receipt array, and because the receipts are never status-checked, the caller is told the batch **succeeded**. The user is left with a standing infinite allowance to a contract and zero deposit, reported as success — exactly the state a careful approval ordering was meant to prevent.

This guarantee is wallet-type-dependent: the smart-wallet sibling executes the same `[approval, position]` as one atomic ERC-4337 UserOp (approval and position revert together), so the residual-allowance state is impossible there. The same SDK code path gives two materially different fund-safety guarantees purely based on which wallet type the integrator wired.

## Findings

- **F021** (`packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:90-100`, high / fund-loss, verified): `sendBatch` loops `const receipt = await this.send(tx, chainId); receipts.push(receipt)` with no `receipt.status` check, so a revert in tx N does not stop tx N+1 from being signed and broadcast; a max-mode approval lands while the position reverts, leaving a residual infinite allowance reported as success. The smart sibling is atomic and throws on `!receipt.success`.
- **F027** (`packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:90-100`, low / correctness, new): `EOAWallet.sendBatch([])` silently returns `[]` (asserted by `EOAWallet.spec.ts:303-306`) while the shared `executeTransactionBatch` rejects an empty list (`executeTransactionBatch.ts:30-31`, `throw new Error('executeTransactionBatch: empty transaction list')`) — the two entrypoints disagree on whether an empty batch is an error.

## Root cause

`send()` (`EOAWallet.ts:62-73`) returns viem's `waitForTransactionReceipt` result unconditionally. viem **resolves** (does not throw) for a mined-but-reverted transaction, and `EOATransactionReceipt` is typed `status: 'success' | 'reverted'` (`packages/sdk/src/wallet/core/wallets/abstract/types/index.ts:9-13`). The revert status is already in hand — the SDK simply never reads it. `sendBatch` (`EOAWallet.ts:90-100`) then loops `send()` with no per-leg status gate and no abort, so a reverted leg cannot stop the subsequent leg from being signed. This is fail-closed-where-the-SDK-already-knows: no new RPC, no inference, just check the field that is already on the receipt. The smart sibling sets the precedent — `DefaultSmartWallet` throws `TransactionConfirmedButRevertedError` on `!receipt.success` in addSigner (`DefaultSmartWallet.ts:353`) and removeSigner (`:415`), and `SmartWalletDeploymentError` in deploy (`:486-487`) — but the EOA send path has no equivalent guard. The empty-batch divergence (F027) is the same shape one layer up: `sendBatch` and its only documented dispatcher disagree on the empty contract.

## Recommended approach

SDK fix, fail-closed at the wallet layer (the source), matching the smart sibling's existing precedent:

1. **Abort on the first reverted leg (F021).** In `EOAWallet.sendBatch`, after each `await this.send(tx, chainId)`, check `receipt.status`. If it is `'reverted'`, throw `TransactionConfirmedButRevertedError` (the same error the smart sibling throws) **before** signing the next leg, so a reverted approval/position never lets a downstream leg broadcast. This makes the EOA batch fail-closed and brings it in line with the smart-wallet atomic semantics.
   - Decide and document whether `send()` itself should also throw on a reverted single-tx receipt (the F020 sibling, owned by #335). Keeping the status check in `send()` and letting `sendBatch` inherit it is the cleaner single point; the batch loop then needs no extra check. If `send()` is left return-as-is for back-compat, the check must live explicitly in the `sendBatch` loop. Pick one and state it, since the abstract `Wallet.send` success contract differs across implementations today (smart throws on revert, EOA returns it).
   - Note the residual-allowance is not auto-unwound: once an approval has landed and the position has reverted, the standing allowance still exists on-chain. The fix prevents the *false-success* and prevents a downstream leg from compounding the loss; the integrator-facing remediation (revoke the dangling approval) belongs in the thrown error's message / docs, not in an automatic on-chain revoke (that would be a speculative extra tx outside scope).

2. **Reject empty input consistently (F027).** Make `EOAWallet.sendBatch([])` throw to match `executeTransactionBatch`'s empty-list rejection, rather than silently returning `[]`. Prefer throwing (the ledger and the existing `executeTransactionBatch` contract both prefer throwing); update the existing `EOAWallet.spec.ts:303-306` "should return empty array for empty batch" assertion to expect the throw.

No demo/CLI work is in scope for this ticket. The `WalletLendNamespace.dispatch` surface (`:89-98`) is cited only as the integration reach that makes the EOA bug live in production lend/swap/borrow; the fix is at the wallet layer, so no namespace change is required (swap and borrow inherit the wallet-layer fix automatically).

## Affected files

- `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:90-100` — `sendBatch`: add the per-leg `receipt.status === 'reverted'` abort and the empty-input rejection.
- `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-73` — `send`: decide whether the status check lives here (so the batch inherits it) or only in the loop.
- `packages/sdk/src/wallet/core/wallets/abstract/types/index.ts:9-13` — `EOATransactionReceipt` `status: 'success' | 'reverted'` (the field already available; no change expected, referenced for the type).
- `packages/sdk/src/wallet/core/error/errors.ts:12+` — `TransactionConfirmedButRevertedError` (reuse the smart sibling's error; no new error class needed).
- `packages/sdk/src/wallet/core/utils/executeTransactionBatch.ts:30-31` — the empty-list contract `EOAWallet.sendBatch` must now match.
- `packages/sdk/src/wallet/core/wallets/eoa/__tests__/EOAWallet.spec.ts:303-306` — flip the empty-batch assertion from `toEqual([])` to expecting a throw; add the mid-batch-revert coverage (see F211, owned separately as test-debt).
- _(reference only, no edit)_ `packages/sdk/src/actions/lend/namespaces/WalletLendNamespace.ts:89-98` — `dispatch` builds `[approval, position]`; documents the production reach.
- _(reference only, no edit)_ `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:353,415,486-487` — the `!receipt.success` → throw precedent the EOA fix mirrors.

## Acceptance criteria / tests

- `sendBatch([tx0, tx1])` where tx0's receipt has `status: 'reverted'` **throws** (no second `sendTransaction` call is made) and does not return a receipt array. Assert via a spy that `walletClient.sendTransaction` was called exactly once before the throw.
- A `[approval, position]` batch where the approval confirms `'success'` and the position confirms `'reverted'` throws `TransactionConfirmedButRevertedError`; the returned/observed state is an error, never a success receipt array. This is the residual-max-allowance regression — it must encode WHY: a max-mode approval landing while the position reverts must not be reported as success.
- `sendBatch([])` throws (mirroring `executeTransactionBatch`'s empty-list error); the prior `toEqual([])` assertion is removed/inverted.
- An all-`'success'` multi-tx batch still returns the full ordered receipt array unchanged (no regression on the happy path; preserves the one-inclusion-wait-per-tx behavior at `EOAWallet.spec.ts:232`).
- Behavior parity statement: after the fix, an EOA `[approval, position]` batch and the smart-wallet equivalent both surface a mid-batch revert as a thrown error rather than a silent success.

## Notes

- The dissent recorded in the ledger (a second reviewer argued medium/correctness given the exact-mode default) is acknowledged; #335 keeps this at **high** because the worst end-state is a standing infinite allowance plus false-success across all three wallet-signing namespaces (lend/swap/borrow) whenever the integrator wired an EOA/`LocalWallet`. The blast radius, not the likelihood under the default, sets the severity.
- This is part of the receipt-status-as-success cluster: F020 (EOA single `send` reverted-as-success) and F034/F212 (smart `send`/`sendBatch` ignore `receipt.success`) share the root shape. Whichever way the `send()`-vs-loop decision lands here should be consistent with how #335 / the smart-side ticket resolve their status checks, so all wallet implementations honor the same abstract `Wallet.send` success contract.
- F211 (`EOAWallet.spec.ts:90-321`, low / test-debt) tracks that the suite currently mocks `waitForTransactionReceipt` with a hardcoded `status: 'success'` and has zero real-execution coverage of this hazard; the new tests above close that gap as part of this work.
- `roughBlockers`: receipt-status-as-success — the entire bug hinges on the SDK never reading `receipt.status`; the fix is to read it. No blocking ticket.
