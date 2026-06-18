# Export SmartWalletDeploymentError and align deploy-path errors to the named taxonomy

> **AUGMENT existing issue #474 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 2 (of 5) |
| **Domain** | wallet |
| **Surface** | `smart/error/errors.ts` `SmartWalletDeploymentError`, `DefaultSmartWalletProvider.createWallet` |
| **Resolves findings** | F142, F143, F144, F145 |
| **Candidate existing issue** | #474 |
| **Blocked by** | (none) |

## Problem

`createSmartWallet()` is a public, multi-chain entrypoint: it attempts a counterfactual smart-wallet deployment on each supported (or caller-selected) chain and returns a `SmartWalletCreationResult` whose `deployments[]` array carries a per-chain `{ chainId, success, receipt?, error? }` record. The contract is a partial-success contract: one chain failing must not erase the others, and the consumer is expected to read the failed entries, recover the structured `chainId`/`receipt`, and retry exactly the chains that did not deploy.

That contract is broken in three concrete ways, all of which the SDK already has the information to handle:

1. **The error type the consumer is handed cannot be named.** `deployments[].error` is statically typed `SmartWalletDeploymentError`, the provider itself branches on `instanceof SmartWalletDeploymentError`, yet the class is never re-exported from `src/index.ts`. A consumer can read `.message` off a plain object but cannot import the class, cannot `instanceof`-narrow it, and so cannot type-safely recover `.chainId`/`.receipt` to retry the right chain.

2. **The one deploy-path error breaks the taxonomy every other SDK error obeys.** `SmartWalletDeploymentError extends Error`, not `ActionsError`. A consumer's standard catch-all (`if (e instanceof ActionsError) handleKnown(e); else rethrow`) silently misclassifies every deploy failure as a foreign/internal error, and the error carries none of the structured `shortMessage`/`metaMessages` the rest of the surface guarantees.

3. **A single unexpected rejection collapses the whole multi-chain result.** `createWallet` aggregates per-chain deploys with `Promise.allSettled`, but the rejected-branch mapper only handles `SmartWalletDeploymentError`; any other rejection is re-wrapped as `throw new Error('Unknown error: ...')` from inside `.map`, which rejects the entire `createWallet` call and discards every other chain's already-settled result.

Fund-safety framing: nothing here moves value incorrectly, so this is not a signing-path exploit. It is an availability and recoverability defect on a public, fund-adjacent entrypoint. When deploy fails on chain N, the consumer needs the structured error to retry chain N and only chain N; today the type gap (1, 2) makes that recovery untyped/un-narrowable, and the aggregation gap (3) can throw away the chains that did deploy, hiding successful deployments the caller may already have funded against. The fix is fail-closed-where-the-SDK-already-knows and consistency-across-the-taxonomy: the SDK owns this error class and the result shape, and the named-error pattern already exists one directory over.

## Findings

- **F142** — `SmartWalletCreationResult.deployments[].error` is typed `SmartWalletDeploymentError` and the provider branches on `r.reason instanceof SmartWalletDeploymentError`, but the class is never exported from the entrypoint, so consumers cannot `instanceof`-narrow it or recover `chainId`/`receipt` (`packages/sdk/src/wallet/core/wallets/smart/error/errors.ts:5-18`; typed-as field at `packages/sdk/src/wallet/core/providers/smart/abstract/types/index.ts:11`; `export *` blocks that omit it at `packages/sdk/src/index.ts:77,167`).
- **F143** — `SmartWalletDeploymentError extends Error` diverges from the `ActionsError`/`BaseError` taxonomy every other SDK error uses, so it has no `shortMessage`/`metaMessages` and fails a consumer's `instanceof ActionsError` catch-all (`packages/sdk/src/wallet/core/wallets/smart/error/errors.ts:5`; base contract at `packages/sdk/src/core/error/errors.ts:6-8`).
- **F144** — `SmartWalletDeployment` models success as an untyped `boolean` with both `receipt?` and `error?` optional, so the type permits impossible states (`success:true` with `error` set, `success:false` with no `error`) and never narrows the consumer to the error branch (`packages/sdk/src/wallet/core/providers/smart/abstract/types/index.ts:7-12`; real invariants enforced only at `packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts:108-123`).
- **F145** — `createWallet`'s rejected-branch mapper handles only `SmartWalletDeploymentError`; any other rejection is `throw new Error('Unknown error: ...')` from inside `.map`, rejecting the whole call and discarding other chains' settled results (`packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts:116-123`).

## Root cause

Two seams drifted off the SDK's own conventions. First, `SmartWalletDeploymentError` was authored as a standalone `extends Error` class in an isolated `smart/error/` module and never wired into the public-error story: not re-exported from `src/index.ts`, not based on `ActionsError`, while the sibling module `wallet/core/error/errors.ts` (already exported at `index.ts:167`) demonstrates the exact target pattern (`TransactionConfirmedButRevertedError extends ActionsError` carrying a `receipt`). Second, the result type `SmartWalletDeployment` was modeled with a loose `success: boolean` plus two optionals, so the real "success ⇒ receipt / failure ⇒ error" invariant lives only in the imperative aggregation code in `DefaultSmartWalletProvider.createWallet`, and that same code uses a bare `throw` as its fallthrough for an unexpected rejection rather than folding it into the partial-success array. In practice `DefaultSmartWallet.deploy` only ever rejects with `SmartWalletDeploymentError` (`DefaultSmartWallet.ts:487,495`), so the bare-throw branch is latent today, but the abstract `SmartWallet` contract does not enforce that, so it is a live contract break for any second implementation.

## Recommended approach

SDK refactor (in scope). Four aligned changes, all small and local to the smart-wallet error/result seam:

1. **Re-base the error on the taxonomy (F143).** Make `SmartWalletDeploymentError extends ActionsError`, mirroring `TransactionConfirmedButRevertedError`: pass a human message plus `metaMessages` (e.g. `chainId`, and a receipt/tx-hash hint when present), keep the typed `chainId` and optional `receipt` fields. Verify the `instanceof SmartWalletDeploymentError` branch at `DefaultSmartWalletProvider.ts:119` still holds after the base-class change.
2. **Export it (F142).** Add `SmartWalletDeploymentError` to the public surface alongside the other named-error modules in `src/index.ts`, and export the `SmartWalletCreationResult`/`SmartWalletDeployment` result types (and `Signer`) so the returned shape is fully nameable by consumers.
3. **Make the result a discriminated union (F144).** Model `SmartWalletDeployment` as `{ chainId; success: true; receipt: ... } | { chainId; success: false; error: SmartWalletDeploymentError }` so `if (!d.success)` narrows `d.error` to non-optional and impossible states are unrepresentable. Adjust the two `.map` constructions in `createWallet` to build the discriminated shape.
4. **Preserve partial success (F145).** In the rejected branch, fold an unexpected (non-`SmartWalletDeploymentError`) rejection into the deployments array as a failed entry (wrapping it in a `SmartWalletDeploymentError` with the known `chainId`) instead of `throw`-ing out of `.map`. This keeps the per-chain partial-success contract intact for any future `SmartWallet` implementation that rejects with an untyped error. Note the original mapper loses the `chainId` on the unknown-rejection path; sourcing it requires pairing the rejected settled result back to its input `chainId` (the `allSettled` array is index-aligned with the chain list), so the implementer should map over indices rather than over the filtered failures.

The adjacent bare-`Error` invariant throws in `DefaultSmartWallet` (e.g. the "not initialized" / "signer does not match" / "invalid signer type" throws) are a related taxonomy gap also filed under #474 but are tracked by their own finding loci and are out of scope for this ticket. Do not refactor them here.

This ticket is SDK-only; there is no demo/CLI surface, so the review-only constraint does not apply. This is not the borrow health-factor item, so no advisory-vs-fail-closed product sign-off is required.

## Affected files

- `packages/sdk/src/wallet/core/wallets/smart/error/errors.ts:5-18` — re-base `SmartWalletDeploymentError` on `ActionsError`; move `chainId`/`receipt` into the structured-error shape.
- `packages/sdk/src/wallet/core/providers/smart/abstract/types/index.ts:7-12` — convert `SmartWalletDeployment` to a discriminated union keyed on `success`.
- `packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts:108-123` — build the discriminated result shape; fold unknown rejections into the array instead of throwing; recover `chainId` for the unknown-rejection entry.
- `packages/sdk/src/index.ts:77,167-169` — export `SmartWalletDeploymentError` and the `SmartWalletCreationResult`/`SmartWalletDeployment` result types (and `Signer`).
- `packages/sdk/src/__tests__/index.exports.spec.ts:16-26` — extend the public-export snapshot to guard the smart-wallet error/result exports (coordinates with the F147 export-guard generalization).

## Acceptance criteria / tests

- `import { SmartWalletDeploymentError } from '@actions/sdk'` (the public entrypoint) resolves; a test asserts the imported class is identical to the internal class (extends the `index.exports.spec.ts` pattern).
- A guard test asserts `new SmartWalletDeploymentError(...) instanceof ActionsError` is `true`, and that a `createSmartWallet` failure entry's `error` satisfies `instanceof ActionsError` (so a consumer's `ActionsError` catch-all classifies it correctly).
- The discriminated-union result compiles such that `if (!d.success)` narrows `d.error` to non-optional `SmartWalletDeploymentError` and `if (d.success)` narrows `d.receipt` to present (type-level test / `expectTypeOf`).
- A unit test injects a deploy that rejects with a non-`SmartWalletDeploymentError` on one chain while another chain succeeds, and asserts `createWallet` resolves (does not reject) with both the successful deployment and a failed entry carrying the correct `chainId` — proving the partial-success contract holds.
- A unit test asserts the existing happy path (all chains succeed) and the existing `SmartWalletDeploymentError` rejection path are unchanged: the provider still branches correctly and returns the same `chainId`/`receipt` data.

## Notes

- The sibling module `packages/sdk/src/wallet/core/error/errors.ts` (`TransactionConfirmedButRevertedError extends ActionsError`, already exported at `index.ts:167`) is the exact pattern to mirror; prefer reusing its `metaMessages` convention over inventing a new shape.
- `receipt` is currently typed as viem's `WaitForUserOperationReceiptReturnType` (`errors.ts:7`, `types/index.ts:10`). That viem-internal type leak on the public surface is a separate concern (F146 / the viem peer-dependency item) and is deliberately not addressed here; this ticket keeps the existing receipt type and only re-bases/exports the error and tightens the result union.
- The public-export snapshot currently guards only the borrow surface (`index.exports.spec.ts:16-26`); extending it for the smart-wallet exports should coordinate with the generalized root-export-snapshot work (F147) rather than duplicating a parallel test.
- This is the SDK-structural half of the #474 named-error reconciliation for the smart-wallet deploy path; the lend/swap bare-`Error` gaps and the remaining `DefaultSmartWallet` invariant throws are tracked under the same issue via their own findings.
