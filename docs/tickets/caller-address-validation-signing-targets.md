# isAddress-validate caller walletAddress/recipient before it becomes a signed target

> **AUGMENT existing issue #163 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | wallet |
| **Surface** | `WalletProvider.getSmartWallet` / `DefaultSmartWalletProvider.getWallet`, `DefaultSmartWallet.sendTokens` recipient, `DefaultSmartWallet.addSigner` EOA owner, `formatPublicKey`, `findSignerInArray` |
| **Resolves findings** | F105, F035, F091, F108, F090 |
| **Candidate existing issue** | #163 |
| **Blocked by** | (none) |

## Problem

Every smart-wallet signing entrypoint that takes a caller-supplied address treats `Address` as if its compile-time `0x${string}` brand were a runtime guarantee. It is not: at runtime, SDK integrators pass plain strings. None of these entrypoints run `isAddress` before the value becomes a signed target — a UserOp `to:`, an ERC-20 `transfer` recipient, a permanent on-chain owner slot, or a CREATE2 owner-bytes input. The guards that do exist are falsy-only (`if (!recipientAddress)`, `if (!walletAddress)`), which a truncated, checksum-mangled, address-poisoned look-alike, or zero address all pass.

The fund-safety consequence: a malformed-but-encodable address is accepted and signed against with no construction-time error.

- A poisoned `walletAddress` becomes `this._address` and the `to:` of every owner-management UserOp (`addOwnerAddress`, `removeOwnerAtIndex`) and the account fed to the bundler for `send`/`sendBatch`.
- A poisoned `sendTokens` recipient is placed in the native send `to:` or buried in the ERC-20 `transfer` calldata, moving funds to an unrecoverable destination.
- A poisoned `addSigner` EOA is encoded into `addOwnerAddress` and committed as **irreversible** governance state: a wrong owner cannot sign, dilutes the owner set, and shifts indices for every later `removeOwnerAtIndex`.
- A non-canonical owner identifier slips through `formatPublicKey` verbatim into CREATE2 derivation, so the SDK reports (and the user funds) a counterfactual address whose on-chain owner layout disagrees with the intended one.

Meanwhile `findSignerInArray` is over-strict in the opposite direction: it `getAddress()`-throws on a single malformed entry instead of returning the documented `-1`, surfacing an opaque viem error during construction instead of the intended "signer not found" message. The surface is internally inconsistent: some addresses are checked too late (falsy-only) and one is checked too aggressively (throws mid-search), and there is no single shared address-shape guard at these signing-path boundaries.

## Findings

- **F105** (medium, malicious-sign) — `packages/sdk/src/wallet/core/providers/WalletProvider.ts:97-131`: `getSmartWallet` forwards the caller's `walletAddressParam` to `smartWalletProvider.getWallet` (line 126) with no `isAddress`/checksum check; it flows to `DefaultSmartWalletProvider.getWallet` → `DefaultSmartWallet.create({ deploymentAddress })` (`DefaultSmartWalletProvider.ts:174-181`), becomes `this._address`, and is the signed `to:` target of owner-management and deploy UserOps.
- **F035** (medium, fund-loss) — `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:512-561`: `sendTokens` guards only `if (!recipientAddress)` (line 518), never `isAddress`; the recipient flows verbatim into the native send `to:` (line 540) or the ERC-20 `transfer` args (line 553). The zero address `0x000…0` passes the falsy check.
- **F091** (low, correctness) — `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-348`: `addSigner` feeds the `typeof signer === 'string'` value (line 318) and the `signer.type === 'local'` `signer.address` (line 342) straight into `encodeFunctionData(addOwnerAddress, …)` with no `isAddress` check; `encodeFunctionData` accepts any right-length 0x-hex, so a malformed owner is committed as permanent, irreversible on-chain governance state.
- **F108** (medium, correctness) — `packages/sdk/src/wallet/core/wallets/smart/default/utils/formatPublicKey.ts:9-14`: `formatPublicKey` pads only when `isAddress(publicKey)` is true and otherwise returns the input **verbatim** (line 13); a non-canonical owner Hex (compressed key, truncated/over-long blob) flows unasserted into the `_signerBytes` getter and on into CREATE2 derivation, deploy calldata, and `findSignerIndexOnChain` owner comparison.
- **F090** (low, correctness) — `packages/sdk/src/wallet/core/wallets/smart/default/utils/findSignerInArray.ts:17-29`: the `findIndex` callback calls `getAddress(signerEntry)` (lines 21, 25), which **throws** `InvalidAddressError` on a single malformed entry instead of returning `-1`, bypassing the caller's clear "signer does not match" message with an opaque viem throw at construction time.

## Root cause

There is no shared address-shape seam at the smart-wallet signing-path entrypoints. `Address` is a compile-time brand only, so each entrypoint reimplements (or omits) the runtime guard: `getSmartWallet`/`getWallet` omit it entirely; `sendTokens` and `addSigner` use a falsy-only check; `formatPublicKey` uses `isAddress` correctly as a *branch condition* but falls through to a verbatim passthrough instead of rejecting; and `findSignerInArray` reaches straight for `getAddress` (which throws) with no `isAddress` pre-check. The SDK already imports `isAddress`/`getAddress` from viem on this exact surface (`formatPublicKey.ts:2`, `findSignerInArray.ts:1`); the gap is that the shape check is not applied consistently at the boundary where a caller value becomes a signed target.

## Recommended approach

All changes are inside the SDK (SDK refactor allowed). Add one shared address-shape guard and apply it at each signing-path entrypoint so a malformed address fails loud at the boundary it enters, before it is encoded or signed. This stays squarely inside the missing-obvious-validation / fail-closed-where-the-SDK-already-knows / sibling-consistency scope — no intent-guessing, no broad refuse-to-sign, no RPC-trust hardening.

1. **Shared guard.** Add a small `assertAddressShape(value, label)` helper (or reuse the existing `validateWalletAddress` family if it already wraps strict `isAddress` + a named error) so every entrypoint below rejects with the same named error. The helper does strict `isAddress`; normalization via `getAddress` is optional and only where a canonical form is later compared.

2. **`getSmartWallet` / `getWallet` (F105).** Assert the caller `walletAddress` shape in `WalletProvider.getSmartWallet` before forwarding to `smartWalletProvider.getWallet` (and/or at the `DefaultSmartWalletProvider.getWallet` boundary so the provider is safe on its own). Fail loud rather than letting a poisoned address become `this._address` and the signed `to:`.

3. **`sendTokens` recipient (F035).** Replace the falsy-only `if (!recipientAddress)` with the strict shape assert (which also rejects a non-canonical look-alike and the zero address) before the recipient reaches the native `to:` or the ERC-20 `transfer` args. Mirrors the swap-recipient validation tracked under #437.

4. **`addSigner` EOA owner (F091).** Assert the EOA string and the `local.address` shape before `encodeFunctionData(addOwnerAddress, …)`; because the owner slot is irreversible, this is the highest-value guard of the set. Mirror the WebAuthn length check F038 already calls for.

5. **`formatPublicKey` (F108).** Change the fall-through: instead of returning a non-address input verbatim, reject any value that is neither a valid 20-byte address (pad to 32) nor an exactly-64-byte WebAuthn public key. Equivalently, add an owner-bytes shape assertion (32 after padding, or 64 for WebAuthn) at the `_signerBytes` boundary so a malformed owner fails at construction instead of producing a silently-wrong funded counterfactual address.

6. **`findSignerInArray` (F090).** Pre-check each entry with `isAddress` before `getAddress`; on a malformed entry return `false` so the search yields `-1` and the caller throws its clear "signer does not match" message (or throw a single named `InvalidSignerError` naming the offending index). Either way, stop the opaque mid-search viem throw. This is consistency with the rest of the surface, not a behavior expansion.

This is the SDK half only. The hosted-signer address-trust roots that feed this same owner logic (Turnkey `ethereumAddress`/`signWith` forwarded raw, node Privy caller-address not reconciled — `refines:F074`, F028/F031) are a separate signing-path ticket and out of scope here, but they share the same "validate the address shape before it becomes an owner" pattern and the same issue #163.

## Affected files

- `packages/sdk/src/wallet/core/providers/WalletProvider.ts:97-131` — `getSmartWallet` forwards caller `walletAddress` with no shape check (F105)
- `packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts:168-181` — `getWallet` → `DefaultSmartWallet.create({ deploymentAddress: walletAddress })`, provider-boundary assert point (F105)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:512-561` — `sendTokens` falsy-only recipient check (F035)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-348` — `addSigner` encodes EOA/local owner with no `isAddress` (F091)
- `packages/sdk/src/wallet/core/wallets/smart/default/utils/formatPublicKey.ts:9-14` — verbatim non-address passthrough (F108)
- `packages/sdk/src/wallet/core/wallets/smart/default/utils/findSignerInArray.ts:17-29` — `getAddress` throws inside `findIndex` instead of returning -1 (F090)

## Acceptance criteria / tests

The smart-wallet suite has no `sendTokens` test at all (F240) and `findSignerInArray` has no malformed-owner test (F239); add coverage alongside the fixes. Each test must fail when the guard is reverted to its current behavior (encode why the address shape matters, not just that the call runs).

- `getSmartWallet`/`getWallet` reject a truncated, checksum-mangled, and zero `walletAddress` with the named error before any `create`/derivation runs; a strict-valid address still resolves.
- `sendTokens` rejects a valid-length-but-not-`isAddress` recipient and the zero address on both the native and ERC-20 branches; a strict-valid recipient still encodes the expected `to:` / `transfer` args (decode the calldata and assert recipient + amount).
- `addSigner` rejects a short/poisoned EOA string and a malformed `local.address` before `encodeFunctionData`; a strict-valid owner still encodes `addOwnerAddress`.
- `formatPublicKey` throws on a 33-byte / truncated / over-long owner Hex (no longer returns it verbatim), still pads a valid 20-byte address to 32, and still passes an exactly-64-byte WebAuthn key.
- `findSignerInArray` with a malformed string entry returns `-1` (or throws the single named `InvalidSignerError`) instead of an opaque `InvalidAddressError`; a well-formed mixed EOA/local array still resolves the correct index.

## Notes

- This augments **#163**. The cross-module integration angle (`refines:F074`: a non-canonical hosted `.address` surfacing later as a wrong-slot `ownerIndex` UserOp revert, linking address-trust roots F028/F031 to the index logic F090/F107) is the larger half of #163 and is referenced here for context; the items in this ticket are the lower-risk, in-place validation fixes that harden the same owner-logic boundary.
- The `send`/`sendBatch` raw escape hatches (`DefaultSmartWallet.ts:217-294`, `refines:F035`/`refines:F061`) are verbatim-signing primitives whose `to:` is caller-chosen; the in-scope defense-in-depth floor (`isAddress`/zero) belongs there too but does not by itself stop a poisoned look-alike, so it is tracked with the broader smart-wallet umbrella rather than expanded here.
- The caller-supplied `chainId` membership gap on these same methods (F109/F022) is a separate validation ticket; this ticket is address-shape only.
- Permit2 signature-payload bound checks (F067 family) share the "validate before encoding" pattern but are a separate signing-path ticket.
