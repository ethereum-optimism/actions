# Reconcile retrieved smart-wallet owner set/index with on-chain owners before signing

> **AUGMENT existing issue #163 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 4 (of 5) |
| **Domain** | wallet |
| **Surface** | `WalletProvider.getSmartWallet` / `DefaultSmartWalletProvider.getWallet` (signers default + dropped nonce), `DefaultSmartWallet.getCoinbaseSmartAccount` (ownerIndex/owners source), `DefaultSmartWallet.addSigner`/`removeSigner` (idempotency + index reconciliation + chain-local rotation) |
| **Resolves findings** | F023, F058, F093, F087, F088 |
| **Candidate existing issue** | #163 |
| **Blocked by** | (none) |

## Problem

A `CoinbaseSmartWallet` UserOperation signature embeds an `ownerIndex` that selects which on-chain owner slot the signature is validated against, and the wallet's counterfactual address is `CREATE2`-deterministic from `(owners, nonce)`. The SDK builds both of those signing-critical inputs from a caller-supplied, in-memory owner model that is never reconciled against the deployed contract. Four ways that model diverges from on-chain reality, all of which produce a wallet that signs against the wrong owner set/index or operates on the wrong address:

1. **Retrieval defaults the owner set to `[signer.address]` / index 0.** `getSmartWallet({ walletAddress, signer })` is a documented shape (`signers` is optional). When `signers` is omitted, `create` defaults `signers = [signer.address]` and resolves `signerIndex = 0`, so `getCoinbaseSmartAccount` signs every op for owner slot 0 of a single-owner set. For a multi-owner wallet, or any wallet where the signer is not on-chain owner 0, the signature is built for the wrong slot and `validateUserOp` rejects the op. Unlike `addSigner`/`removeSigner` (which reconcile via `findSignerIndexOnChain`), the send path never reads on-chain owners.

2. **Retrieval drops the caller-supplied nonce.** `getWallet` does not forward `nonce`, even though `GetSmartWalletOptions` carries it and `getSmartWallet` destructures it. A wallet created with a non-zero nonce, then retrieved and lazily deployed, derives and deploys the nonce-0 `CREATE2` address: a different account than the one the caller funded and transacts against.

3. **`addSigner` is not idempotent and never proves the returned index.** Re-adding an existing owner consumes a sponsored UserOp and then reverts `AlreadyOwner`, surfaced only as a generic confirmed-but-reverted error. The returned index comes from a separate on-chain scan keyed on the public key, never asserted to point at the owner the op actually encoded.

4. **Owner rotation is chain-local on a cross-chain-deterministic wallet.** `addSigner`/`removeSigner` each take one `chainId` and mutate only that chain's owner array, but the identical address exists on every supported chain. Owner sets silently diverge across chains, and the shared in-memory `this.signers` is never refreshed after a rotation the wallet itself performed.

Fund-safety framing: defects 1 and 3 are recoverable availability bugs (the op is rejected at validation, no value moves) but they brick the documented retrieval path and burn sponsored ops. Defect 2 makes the SDK operate on a different counterfactual address than the user funded, so deposits become inaccessible from the SDK-driven wallet. Defect 4 is an owner-rotation-safety gap: rotating out a compromised key on one chain leaves it live as an owner of the identical address on every other chain. None of this is intent-guessing: the SDK can read the real owner layout and nonce and either reconcile or fail closed.

## Findings

- **F023** — `getSmartWallet` with `walletAddress` but no `signers` pins `ownerIndex` to 0 and `owners` to `[signer.address]`, so a multi-owner wallet signs against the wrong slot and every op reverts at validation (`packages/sdk/src/wallet/core/providers/WalletProvider.ts:97-131`; defaulting/signing seam at `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-207`).
- **F058** — `DefaultSmartWalletProvider.getWallet` never forwards the caller nonce into `DefaultSmartWallet.create`, so a retrieved wallet has `this.nonce === undefined`; `deploy()` and `getAddress()` fall back to nonce 0 and target the wrong `CREATE2` address (`packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts:168-184`; `getSmartWallet` does not pass `nonce` on the `getWallet` call at `WalletProvider.ts:126-130`).
- **F093** — `addSigner` has no `isOwnerAddress`/`isOwnerBytes` precheck (re-adding reverts `AlreadyOwner` after a consumed UserOp) and resolves the returned index via a separate public-key scan that is never asserted to equal the owner the op encoded (`packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-375`).
- **F087** — `addSigner`/`removeSigner` mutate the on-chain owner array but never refresh in-memory `this.signers` / `this.signerIndex` / counterfactual `_address`; the next `getCoinbaseSmartAccount` rebuilds the account from the stale owner model (`packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-375,390-422,78-80,196-207`).
- **F088** — `addSigner(signer, chainId)` / `removeSigner(signer, chainId, ...)` apply the rotation to one chain only, but the wallet is `CREATE2`-deterministic across all chains, so owner sets diverge per-chain with no per-chain bookkeeping and no chain-local-rotation warning (`packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-375,390-422,196-207`).

## Root cause

The signing account is reconstructed on every `send`/`sendBatch` from a purely in-memory owner model — `this.signers`, `this.signerIndex`, `this.nonce`, `this._address` — that is seeded from caller input at construction and mutated only in the constructor. `getCoinbaseSmartAccount` (`DefaultSmartWallet.ts:196-207`) trusts that model verbatim: `ownerIndex: this.signerIndex`, `owners: this.signers`, `nonce: this.nonce`. The retrieval path (`getWallet`) seeds it loosely (defaulted `signers`, dropped `nonce`), and the rotation path (`addSigner`/`removeSigner`) changes on-chain state without updating the model or covering all chains. The SDK already has the tools to close the loop: `findSignerIndexOnChain` (used by `addSigner`/`removeSigner` and exposed as a wallet method at `DefaultSmartWallet.ts:431`) reads the live owner layout, and the on-chain owner-membership reads exist for an idempotency precheck. The gap is that the send path and the retrieval seam never call them.

## Recommended approach

This is SDK signing-path work (the embedded `ownerIndex`/`owners` and the `CREATE2` nonce are inputs to the signed UserOp), so reconcile or fail closed where the SDK already knows the answer. Keep the four loci consistent with the `addSigner`/`removeSigner` reconciliation that already exists.

1. **Reconcile the owner index on the retrieved-wallet path (F023).** When a wallet is constructed against a known `deploymentAddress`, resolve the signer's actual on-chain index via `findSignerIndexOnChain` before the first sign instead of trusting array position, and use that for `ownerIndex`/`owners`. If the signer is not a current on-chain owner (index `-1`), throw a typed error rather than silently defaulting to slot 0. Where the caller does pass a full `signers` array, validate the signer is present and let the resolved index win over the array position. Document that omitting `signers` is fine for single-owner wallets and is reconciled on-chain otherwise.

2. **Thread the nonce through retrieval (F058).** Add `nonce?: bigint` to `SmartWalletProvider.getWallet` / `DefaultSmartWalletProvider.getWallet` and forward it into `DefaultSmartWallet.create`; have `WalletProvider.getSmartWallet` pass `nonce` on the `getWallet` call (not only on `getWalletAddress`). When both `walletAddress` and `nonce` are known, this also enables a cheap consistency check (derived address vs supplied `deploymentAddress`).

3. **Make `addSigner` idempotent and prove the index (F093).** Precheck on-chain owner membership and short-circuit (return the existing index) or throw a typed `AlreadyOwner` before sending the UserOp. After the op, assert `ownerAtIndex(returnedIndex)` equals the owner bytes the op encoded, not merely that some matching owner exists, so a concurrent rotation between the add and the scan cannot return a foreign slot.

4. **Refresh the in-memory model after rotation and address chain-locality (F087, F088).** After a successful `addSigner`/`removeSigner`, update `this.signers` / `this.signerIndex` (and invalidate/recompute `_address` for counterfactual wallets) so the next sign matches on-chain state — or, simpler and lower-risk, re-derive the owner index from chain at the start of each `send`/`sendBatch` so a stale model can never be signed against. For F088, either accept `chainIds[]` and apply the rotation across all deployed chains with per-chain success reporting (mirroring `createWallet`), or, at minimum, document loudly that rotation is chain-scoped and track owner state per chain; a key rotated out on one chain must not be reported as removed wallet-wide.

This is a fail-closed-where-the-SDK-already-knows and cross-locus-consistency fix, not refuse-to-sign or intent-guessing. It does not rely on trusting the integrator's RPC beyond the existing documented assumption: the same `findSignerIndexOnChain`/owner reads the rotation path already performs are simply extended to the send and retrieval seams.

## Affected files

- `packages/sdk/src/wallet/core/providers/WalletProvider.ts:97-131` — retrieval entrypoint; defaults `signers`, does not pass `nonce` to `getWallet` (126-130).
- `packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts:168-184` — `getWallet` drops the caller nonce and forwards an undefined `signers`.
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:122` — `create` defaults `signers = [params.signer.address]`.
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-207` — `getCoinbaseSmartAccount` signs from `this.signerIndex` / `this.signers` / `this.nonce` with no on-chain reconciliation.
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-375` — `addSigner` (no idempotency precheck; returned index from a separate unasserted scan; no in-memory refresh; single chain).
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:390-422` — `removeSigner` (no in-memory refresh; single chain).
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:456-500,573-587` — `deploy()` / `getAddress()` use `this._signerBytes` and `this.nonce || 0n`, the seam where a dropped nonce or stale signers targets the wrong `CREATE2` address.
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:431-441` — existing `findSignerIndexOnChain` wallet method to reuse for reconciliation.

## Acceptance criteria / tests

- A retrieved wallet for a multi-owner deployment where the signer is on-chain owner index `N != 0`, called via `getSmartWallet({ walletAddress, signer })` with `signers` omitted, signs subsequent ops with `ownerIndex = N` (resolved on-chain), or throws a typed error if the signer is not a current owner. A test that mutates `getCoinbaseSmartAccount` to pass `ownerIndex: 0` unconditionally must now fail.
- `getSmartWallet({ walletAddress, signer, nonce })` forwards `nonce` into the wallet instance; `deploy()` / `getAddress()` use the supplied nonce rather than 0. A wallet created with a non-zero nonce and retrieved with that nonce derives the same `CREATE2` address it was funded at.
- `addSigner` on an already-present owner short-circuits or throws a typed `AlreadyOwner` before sending a UserOp (no sponsored op consumed); the post-add assertion confirms `ownerAtIndex(returnedIndex)` equals the encoded owner bytes.
- After a successful `addSigner`/`removeSigner`, the next `getCoinbaseSmartAccount` reflects the rotated owner set/index (in-memory refresh) or re-resolves it from chain; a test asserts the local owner model matches on-chain after rotation. This addresses the F234 coverage gap where `sendBatch`/`findSignerIndexOnChain` are mocked and post-rotation signing state is never asserted.
- `removeSigner` for a compromised key applied to one chain either rotates across all deployed chains (per-chain success reporting) or is documented/typed as chain-scoped; a test asserts the key is not reported as removed wallet-wide when only one chain was rotated.

## Notes

- Per-finding severity in the ledger after the P10 re-trace: F023/F058/F088/F093 are medium/correctness; F087 was refined high to low (real in-memory staleness, but the index-shift premise was wrong — Coinbase owner indices are monotonic and the deployed path signs correctly, so the live impact is narrow counterfactual/hygiene). The owner-index defects are recoverable (the bad op is rejected at validation, no value moves); F058 is the locus where value can actually be stranded at the wrong `CREATE2` address. The bundle is grouped because all four share the one root cause: an unreconciled in-memory owner model.
- The end-to-end coverage for the owner-rotation path (sign-with-the-new-key after rotation, the only test that catches F087's stale model, plus the wrong-`ownerIndex`-rejected adversarial case for F023) lives in the single consolidated Anvil feature-test ticket (findings F241/F242), not here. Interim, an independent-oracle unit test that decodes the `executeBatch` calldata against the real Coinbase ABI (F242) anchors the encode step before that bundler/paymaster e2e lands.
- Re-fetching a fresh wallet via `getSmartWallet` after a rotation is the documented workaround for the stale-model angle; if the team prefers to keep instances immutable, document that rotation invalidates the instance rather than refreshing the model in place.
