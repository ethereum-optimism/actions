# Add a shared hosted-wallet signer-address reconciliation seam

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Complexity** | 4 / 5 |
| **Domain** | wallet |
| **Surface** | `HostedWalletProvider` abstract `createSigner`/`toActionsWallet`; Privy/Turnkey/Dynamic `createSigner`; `WalletNamespace.isLocalAccount` routing |
| **Resolves findings** | F074, F028, F029, F031, F068-priv, F215 |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

## Problem

Every hosted wallet (Privy, Turnkey, Dynamic) exposes two facts about itself: a reported `.address` and an actual signing backend. Nothing in the SDK ever checks that those two agree. The reported address is what flows into `from`, balance lookups, ERC-20 approval owners, lend `onBehalfOf`, swap/transfer recipients, and smart-wallet owner slots; the signing backend is what actually produces signatures. When the two diverge, the SDK builds, approves, and signs against an account that the key cannot control, and there is no construction-time error.

The divergence is reachable today through ordinary integration paths, not exotic attacker primitives:

- **Node Privy** sets `this.address` from the caller-supplied `params.address` and only later builds the signer from `walletId`. A caller who passes a `(walletId, address)` pair that does not correspond (copy-paste of the wrong wallet, a stale address, a different Privy wallet) gets a wallet whose reported address is one account and whose signing key is another. Approvals and `from` target the reported account; the signature comes from the key. The two never reconcile.
- **Turnkey** forwards a caller-supplied `ethereumAddress` straight to `createAccount` as the reported address while `signWith` selects the signing key independently. A mismatched `ethereumAddress`/`signWith` pair produces a `LocalAccount` whose `.address` is attacker- or typo-controlled relative to the key, with zero cross-check.
- **`isLocalAccount` routing** is the inverse hole: a Privy/Turnkey-derived signer is itself `type: 'local'`, so passing that signer into `WalletNamespace.toActionsWallet` routes it to `LocalWallet` and silently bypasses the hosted provider that would otherwise carry the reconciliation.

In a DeFi context the failure mode is fund-relevant: a wallet that reports address A but signs with key B will set approvals, `onBehalfOf`, and recipients on A while only B's signatures are produced. Depending on the action that is either an unsignable owner slot / reverting UserOp (recoverable) or funds moved relative to the wrong account. None of it surfaces at construction, and no provider has a self-test that would catch it.

## Findings

- **F074** — `packages/sdk/src/wallet/core/providers/hosted/abstract/HostedWalletProvider.ts:45-56`: the abstract base declares `toActionsWallet` and `createSigner` but defines no shared signer-identity reconciliation seam; each subclass trusts caller/vendor `.address` verbatim before verbatim-signing `send`/`sendBatch`.
- **F028** — `packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts:87-95`: `createSigner` spreads `{ ...params }` into the Privy `createSigner` util, so `params.address` reaches the signer unnormalized and unreconciled, while the sibling `toActionsWallet` (line 67) at least runs `getAddress(params.address)`. Two methods on one provider, two different address contracts, neither reconciling address against `walletId`.
- **F029** — `packages/sdk/src/wallet/node/wallets/hosted/privy/PrivyWallet.ts:36`: `this.address = params.address` is set from caller input, then `performInitialization` (49-50) builds the signer from `walletId`; the reported address and signing key are never reconciled (the sibling React Privy path derives address from the signer).
- **F031** — `packages/sdk/src/wallet/node/wallets/hosted/turnkey/utils/createSigner.ts:25-31`: `ethereumAddress` and `signWith` are destructured and forwarded to `createAccount` with no format validation and no cross-check that the resolved `signWith` key actually controls `ethereumAddress`; the caller-supplied address becomes the reported signing address.
- **F068-priv** — Privy `createSigner` address/signer-trust facet: node `packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts:90-94` passes the caller address through unreconciled, and react `packages/sdk/src/wallet/react/wallets/hosted/privy/utils/createSigner.ts:19-29` re-wraps the vendor account taking `privyViemAccount.address` as authoritative with a `CustomSource` `signTypedData` cast and no recovering-signer check on the EIP-712/Permit2 seam.
- **F215** — `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts:22-34,190-206`: `isLocalAccount` returns true for a hosted-derived signer (it is `type: 'local'`), so `toActionsWallet` routes it to `LocalWallet` (193-200) and silently bypasses the hosted provider, untested for this hosted-signer collision.

## Root cause

There is no single place where a hosted wallet asserts "the address I report is the address my key signs as." The check that exists in one method of one provider (`getAddress` in node Privy `toActionsWallet`) is normalization, not reconciliation, and it is absent from the sibling `createSigner` and from Turnkey/Dynamic entirely. Because the reconciliation is per-provider and inconsistent, each provider trusts a different caller/vendor field, and the `isLocalAccount` shortcut lets a hosted signer skip the provider layer altogether. The fix space is exactly the in-scope kind: an obvious invariant the SDK already has the inputs to check (it holds both the reported `.address` and a signing backend), missing in every provider, and inconsistent across siblings.

## Recommended approach

Add one shared self-test seam, run by every hosted provider/wallet at construction, that proves the signing key recovers to the reported address before the wallet is usable.

1. **Add a reconciliation helper on the hosted seam.** Introduce a single shared function (e.g. on `HostedWalletProvider` or a small `reconcileSignerAddress(signer)` util that the providers and the EOA-backed hosted wallets call). It signs a fixed, domain-separated self-test payload with the resolved signer and asserts `recoverMessageAddress(signature) === getAddress(signer.address)`. On mismatch it throws a clear, named error at construction time. This is the generic seam F074/F231 ask for: one place that catches F028, F029, and the Turnkey gap at once.
   - Use a constant self-test message scoped to this check so it cannot be confused with a user-intended signature. A message recover is sufficient and avoids depending on chain/RPC.
2. **Wire it into all three providers consistently.** Node Privy `createSigner` and `PrivyWallet` initialization, Turnkey `createSigner`, and Dynamic `createSigner` all run the same seam after building their `LocalAccount`. This also closes the F028 node-Privy asymmetry (both `createSigner` and `toActionsWallet` end up reconciled) and removes the divergence where Turnkey/Dynamic do not normalize at all. Normalize the reported address through `getAddress` everywhere so the comparison is checksum-stable.
3. **Close the `isLocalAccount` bypass (F215).** A hosted-derived signer routed back into `toActionsWallet` should not silently skip reconciliation. Two acceptable shapes, pick the one that fits the existing API contract:
   - Tag hosted-derived signers (e.g. a non-enumerable marker set when the hosted provider builds the `LocalAccount`) and have `isLocalAccount`/`toActionsWallet` route a tagged signer through the hosted path (or at minimum still run the reconciliation seam) rather than constructing a bare `LocalWallet`; or
   - Keep the `LocalWallet` route but run the same `reconcileSignerAddress` seam inside `LocalWallet.create`, so reconciliation is enforced regardless of which branch is taken.
   Add the missing test for this collision (a Privy/Turnkey signer passed to `toActionsWallet` must not silently bypass the provider).
4. **Turnkey/Privy field validation (F031, F068-priv).** As part of the same seam, validate the shape of the caller-supplied `ethereumAddress` (Turnkey) and `address` (Privy) with `isAddress`/`getAddress` before they become the reported address, so a malformed value fails loudly rather than flowing into owner/recipient logic. The recover-equals-address self-test then catches a well-formed-but-wrong address.

Scope notes: this is an SDK-internal hardening seam; no public method signature needs to change (the seam runs inside existing construction paths and throws on violation). React Privy/Dynamic are SDK code, not demo/CLI, so they are in scope for the refactor; the EIP-712/Permit2 `signTypedData` recovering-signer concern on the react Privy cast is tracked separately under the Permit2/signature-path tickets and only the message-recover address self-test is required here.

## Affected files

- `packages/sdk/src/wallet/core/providers/hosted/abstract/HostedWalletProvider.ts:45-56` — host the shared seam (or its declaration).
- `packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts:67,87-95` — reconcile in `createSigner`; align with `toActionsWallet`.
- `packages/sdk/src/wallet/node/wallets/hosted/privy/PrivyWallet.ts:22,36,48-50` — reconcile reported `address` against the initialized signer.
- `packages/sdk/src/wallet/node/wallets/hosted/turnkey/utils/createSigner.ts:25-31` — validate `ethereumAddress`/`signWith`, reconcile.
- `packages/sdk/src/wallet/react/wallets/hosted/privy/utils/createSigner.ts:19-29` — reconcile the re-wrapped vendor account's reported address.
- `packages/sdk/src/wallet/react/wallets/hosted/dynamic/utils/createSigner.ts:24-37` — reconcile `walletClient.account.address` against the connector signing backend.
- `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts:22-34,190-206` — close the `isLocalAccount` hosted-signer bypass.
- `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:44-52` — if the seam is enforced at the EOA-wallet layer, the `signer`/`address` pairing is the natural place to assert it.

## Acceptance criteria / tests

- A new shared self-test: given a `LocalAccount`, signing a fixed self-test message and recovering it equals `getAddress(account.address)`; a deliberately mismatched signer/address pair throws a clear named error.
- Node Privy: constructing a `PrivyWallet`/`createSigner` with a `(walletId, address)` pair whose key does not recover to `address` throws at construction, not at first signed tx. The existing tautological spec (`PrivyHostedWalletProvider.spec.ts:120-141`, F226/F232) is replaced or augmented with a mock that resolves `walletId -> key` so the divergence is actually observable.
- Turnkey: a caller-supplied `ethereumAddress` that does not match the `signWith` key is rejected; the current "forwarded-to-mock" assertion (`createSigner.spec.ts:53-76`, F227) is upgraded to a real reconciliation assertion.
- `WalletNamespace.toActionsWallet`: passing a Privy/Turnkey-derived signer does not silently route to `LocalWallet` without reconciliation; a test asserts the hosted-signer collision is handled (F215).
- A construction-time self-test exists for every hosted provider (Privy node/react, Turnkey, Dynamic), closing the F231 "no provider has a self-test" gap.
- Reconciliation tests assert recover-equals-address (not mock-against-itself), so the test can fail when the address-handling contract regresses (intent, not tautology).

## Notes

- Severity is medium: the divergence is real and fund-relevant, but the dominant trigger is integrator misconfiguration (an inconsistent `(walletId, address)` or `ethereumAddress`/`signWith` pair) rather than an external-attacker primitive. The seam is cheap insurance that converts a silent wrong-account signing into a loud construction-time failure.
- This is the generic seam referenced by the caller-address owner-logic ticket (`caller-address-validation-signing-targets.md`) and issue #163 / #335: a non-canonical hosted `.address` otherwise surfaces downstream as a wrong-slot `ownerIndex` (UserOp revert) in `DefaultSmartWallet`. This ticket fixes the address-trust root; the owner-slot/index hardening is tracked there.
- The companion E2E coverage (real Privy/Turnkey/Dynamic creds plus Anvil-simulated signing asserting `recoverMessageAddress === wallet.address === signer.address` and adversarial wrong-address) is the single consolidated Anvil feature-test ticket (F230), built later; the unit-level self-test in this ticket stands on its own.
- F068-priv is the Privy `createSigner` address/signer-trust facet (node spread-through + react vendor re-wrap), grounded at the cited lines; the EIP-712/Permit2 `signTypedData` recovering-signer concern on the react cast is out of scope here and lives with the Permit2/signature-path work.
