# Guard removeSigner against removing the only signable key (loss-of-access)

> **AUGMENT existing issue #163 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | high |
| **Complexity** | 3 / 5 |
| **Domain** | wallet |
| **Surface** | `DefaultSmartWallet.removeSigner` (`packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:390-422`) |
| **Resolves findings** | F039 |
| **Candidate existing issue** | #163 |
| **Blocked by** | `smart-wallet-owner-set-reconcile` |

## Problem

`removeSigner` removes an owner from a funded smart wallet with no precheck. It unconditionally encodes `removeOwnerAtIndex(index, signerBytes)` and submits it as a sponsored UserOperation. Two fund-safety hazards follow, both of which the SDK has enough information to catch before spending the UserOp:

- **Remove-the-only-key lockout (loss-of-access).** Nothing prevents removing `this.signer` itself — the only `LocalAccount` this SDK instance holds a private key for. The removal UserOp is signed by `this.signer`, lands successfully, and afterward this client can never produce a valid signature for the wallet again. Every subsequent `send`/`sendBatch` (every withdrawal or transfer of funds the smart wallet holds) fails validation. The remaining on-chain owners can be plain-address or WebAuthn owners this instance has no key for, so `ownerCount` can still be greater than 1 while the wallet is permanently unsignable from the only key the integrator controls. This is the load-bearing harm: a self-inflicted, single-call, irreversible lockout of a funded account.
- **Last-owner brick surfaces opaquely.** The Coinbase Smart Wallet `MultiOwnable` implementation reverts `LastOwner()` when `removeOwnerAtIndex` is called with `ownerCount === 1`; the only sanctioned way to remove the final owner is `removeLastOwner(index, owner)`. The SDK never reads `ownerCount()` and never dispatches `removeLastOwner`, even though both are in its own bundled ABI. So removing the last owner reverts on-chain after the sponsored UserOp is consumed, and the caller gets a generic `TransactionConfirmedButRevertedError('remove signer call failed')` with no indication the cause was the last-owner constraint, and the legitimate last-owner-removal flow is permanently unreachable.

Framing: the load-bearing fund-safety harm is the remove-only-key lockout (loss-of-access to a funded wallet), which the contract does not prevent. The `LastOwner` brick is contract-prevented (it reverts rather than bricking) but is surfaced opaquely and leaves a real capability — last-owner removal — unwired. Severity is high rather than critical because the lockout is self-inflicted by a single caller action, not attacker-triggered.

## Findings

- **F039** — `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:390-422`: `removeSigner` resolves an index (caller-supplied or `findSignerIndexOnChain`), computes `signerBytes = formatPublicKey(getSignerPublicKey(signer))` (:400), and unconditionally encodes `removeOwnerAtIndex(BigInt(resolvedSignerIndex), signerBytes)` (:404-408) with no `ownerCount > 1` guard and no not-self guard, then submits it via `sendBatch` (:412). It can remove the only key this client can sign with (loss-of-access) or hit the on-chain `LastOwner` revert, which surfaces only as the opaque `TransactionConfirmedButRevertedError('remove signer call failed')` at :414-419.

Supporting refinement rows from the ledger that this ticket folds into F039:

- `DefaultSmartWallet.ts:390-411` (`refines:F039`, verified high): `removeOwnerAtIndex` with no `ownerCount>1` guard and no not-self guard; load-bearing harm is remove-only-key lockout leaving only unsignable owners.
- `DefaultSmartWallet.ts:390-422` (`refines:F039`): the bundled ABI exposes `removeLastOwner` and `ownerCount` (`constants/index.ts:208,222`) but the SDK never reads or dispatches either, so the only-owner removal path is unreachable and the `LastOwner` revert is opaque.
- `DefaultSmartWallet.ts:390-411` (`refines:F039`): `removeSigner` derives index and `ownerBytes` independently; a stale/wrong caller-supplied index can revert (`WrongOwnerAtIndex`) or, after a prior removal shifts live owners, point at a different live owner.
- `DefaultSmartWallet.ts:390-422` (original F039, low): caller-provided `signerIndex` (:395-396) is not cross-checked against the owner actually at that index before spending the UserOp; the contract enforces it via `WrongOwnerAtIndex`, but the SDK surfaces only a generic revert.

## Root cause

`removeSigner` treats owner removal as a single unconditional encode-and-send with no on-chain preflight, while the SDK already holds everything needed to fail closed:

- It knows `this.signer` — the only `LocalAccount` it can sign with — and the resolved owner/index it is about to remove, so it can detect a self-removal before sending. It does not compare them.
- Its own bundled ABI (`constants/index.ts`) includes `ownerCount()` (:208), `ownerAtIndex()` (:201), and `removeLastOwner()` (:222), so it can read the count, confirm the index holds the signer, and route last-owner removals correctly. It reads none of them and always dispatches `removeOwnerAtIndex`.

So the SDK already-knows the conditions that make the call a lockout or a guaranteed opaque revert, and simply does not check them. This is missing-obvious-validation plus a fail-closed gap on the signing-authority path, not intent-guessing.

## Recommended approach

SDK fix in `DefaultSmartWallet.removeSigner`. Add cheap on-chain prechecks before encoding the removal UserOp, and wire the already-bundled functions:

1. **Not-self guard (the load-bearing fix).** Before sending, compare the owner being removed against `this.signer`. If the resolved owner is the only `LocalAccount` this instance can sign with (i.e. removing it would leave the in-memory signer with no corresponding on-chain owner), reject with a typed `SelfRemoval`/loss-of-access error. Match the existing helpers: compare via `formatPublicKey(getSignerPublicKey(...))` of `this.signer` against the resolved `signerBytes`, and/or compare `resolvedSignerIndex` against `this.signerIndex`. Coordinate the exact owner-set comparison with the reconcile work (see Blocked by), since the in-memory `this.signers`/`this.signerIndex` are not refreshed after a rotation.
2. **`ownerCount > 1` precondition.** Read `ownerCount()` (bundled ABI) on `chainId` before encoding. If `ownerCount === 1`, do not silently submit a `removeOwnerAtIndex` that will revert `LastOwner()`. Either reject with a typed `LastOwner` error explaining that removing the last owner bricks the wallet, or dispatch `removeLastOwner(index, owner)` if last-owner removal is the intended capability. At minimum the only-owner case must fail loudly in the SDK rather than as an opaque post-UserOp revert.
3. **Index/owner cross-check (folds in the original low-severity F039).** When `signerIndex` is caller-supplied, verify `ownerAtIndex(index)` equals the formatted `signerBytes` before spending the UserOp, surfacing a clear error instead of the raw `WrongOwnerAtIndex` revert. This also closes the stale-index-after-shift hazard.

Consistency note (sibling parity): `addSigner` already resolves and validates the index from chain after the mutation; `removeSigner` should be brought to the same fail-closed standard on the input side. Keep the guards as preconditions plus typed errors — no broad refuse-to-sign, no intent-guessing beyond "are we about to remove our own only signing key / the last owner."

## Affected files

- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:390-422` — add not-self guard, `ownerCount > 1` precondition, optional index/owner cross-check, and `removeLastOwner` dispatch path; the constructor fields used by the guards are `this.signer` (:44,:78), `this.signers` (:48,:79), `this.signerIndex` (:50,:80).
- `packages/sdk/src/wallet/core/wallets/smart/default/constants/index.ts:201,208,222,232` — bundled ABI already exposes `ownerAtIndex`, `ownerCount`, `removeLastOwner`, `removeOwnerAtIndex`; no ABI change needed, just wire the reads/dispatch.
- `packages/sdk/src/wallet/core/wallets/smart/default/utils/formatPublicKey.ts:9` and `utils/getSignerPublicKey.ts:13` — reuse for the not-self byte comparison.
- `packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:435-511` — existing `removeSigner` tests stub `sendBatch`/`findSignerIndexOnChain` and assert only encoded calldata and the returned index (F234); extend with the guard cases below.

## Acceptance criteria / tests

- **Not-self lockout rejected:** `removeSigner(theOwnerCorrespondingToThisSigner, chainId)` (whether index is looked up or caller-supplied) throws a typed self-removal / loss-of-access error and never calls `sendBatch`. A test that today would pass (calldata encoded, UserOp sent) must now fail unless the guard is present.
- **Only-owner case fails loud or routes correctly:** with `ownerCount()` mocked to `1`, `removeSigner(theOnlyOwner, chainId)` either throws a typed `LastOwner` error before sending, or dispatches `removeLastOwner(index, owner)` (assert the encoded function name) — never a bare `removeOwnerAtIndex` that relies on the opaque on-chain revert.
- **Multi-owner non-self removal still works:** with `ownerCount() > 1` and the removed owner distinct from `this.signer`, `removeSigner` encodes `removeOwnerAtIndex(index, signerBytes)` and returns the receipt as today (no regression).
- **Caller-supplied stale index rejected pre-send:** when `ownerAtIndex(index)` does not equal the formatted signer bytes, `removeSigner(signer, chainId, wrongIndex)` throws a clear pre-send error and does not spend a UserOp.
- Each test encodes WHY: the assertions must fail if the not-self / `ownerCount` / index-match guard is removed, not merely assert the happy-path calldata.

## Notes

- Scope: this is a signing-authority hardening on the smart-wallet path (missing-obvious-validation + fail-closed where the SDK already knows), and a consistency fix bringing `removeSigner` input validation up to `addSigner`'s standard. Not intent-guessing, not broad refuse-to-sign, not RPC-trust hardening — the `ownerCount`/`ownerAtIndex` reads are ordinary on-chain preflight against the integrator's own RPC.
- **Blocked by `smart-wallet-owner-set-reconcile`** (F087): the not-self comparison depends on a trustworthy in-memory owner set. Today `this.signers`/`this.signerIndex`/`_address` are never refreshed after a rotation, so the not-self guard should be built on top of (or alongside) the owner-set reconcile so the comparison uses the live on-chain owner layout rather than a stale snapshot.
- The end-to-end Anvil feature-test (single consolidated ticket, built later) covers the only-owner `removeSigner` adversarial case on a real bundler — this ticket is the SDK-side guard that the e2e leg will exercise; do not duplicate the bundler harness here.
- Related but out of scope for this ticket: F087 stale in-memory owner set (its own reconcile ticket) and F234 (the test row noting the existing `removeSigner` tests cannot fail on this brick because `sendBatch` is stubbed to succeed) — the test work above resolves the `removeSigner` half of F234's gap.
