# Validate swap recipient consistently (isAddress/checksum/zero across providers and resolver)

> **AUGMENT existing issue #437 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | swap |
| **Surface** | `validation.ts` `validateRecipient`/`validateNotZeroAddress`, `ens/utils.ts` `resolveAddress`/`passthroughResolver`, Velodrome v2/leaf recipient encode, same-asset guard |
| **Resolves findings** | F066, F043, F076, F006, F069 |
| **Candidate existing issue** | #437 |
| **Blocked by** | (none) |

## Problem

The swap recipient is the address that receives swap output. On the Velodrome v2/leaf router family the recipient is baked verbatim into the calldata the wallet signs, so a poisoned, mistyped, non-canonical, or zero recipient that survives validation sends funds to the wrong address with no on-chain recovery. The SDK has three guards that are supposed to catch this (`validateRecipient`, `validateNotZeroAddress`, and the `resolveAddress`/`passthroughResolver` resolver), but they disagree about what a valid recipient is:

- `validateRecipient` only zero-checks, and only for inputs that pass strict `isAddress`. Any value that is not already a strictly-valid hex address (ENS name, truncated hex, a `0x...` with a flipped/invalid EIP-55 checksum) silently no-ops.
- The resolver accepts inputs with `isAddress(input, { strict: false })`, so it admits the exact non-canonical hex addresses that strict `validateRecipient` then skips, and returns them verbatim with no checksum normalization and no zero-address guard.
- `validateNotZeroAddress` compares against a lowercase string literal with `===` instead of `isAddressEqual`, so it depends on byte-exact casing rather than address equality.

Net: the strict/non-strict predicate mismatch means a malformed-but-parseable recipient passes the resolver, is baked into Velodrome v2/leaf calldata, and is never reconciled against a canonical address before signing. The two correctness siblings on the same surface (same-asset symbol-only compare F006, chain-agnostic asset block F069) share the same root pattern: identity checks on this surface should key on canonical addresses, not on symbols, casing, or cross-chain-flattened address sets.

## Findings

- **F066** — `packages/sdk/src/utils/validation.ts:176-180`: `validateRecipient` runs the zero-check only inside `if (recipient && isAddress(recipient))`, so it silently no-ops on ENS names and any non-strict-hex string; it is the sole recipient guard in `SwapProvider.validateSwapExecute` (`SwapProvider.ts:450`) on both the raw and pre-built-quote paths.
- **F043** — `packages/sdk/src/services/nameservices/ens/utils.ts:43-47` (and `passthroughResolver` at `:20-25`): `resolveAddress` returns a hex input verbatim after `isAddress(input, { strict: false })` with no EIP-55 checksum and no zero-address guard, while the ENS-name branch (`:78-83`) correctly rejects the zero address via `isAddressEqual`; the resolver is exported as a public utility, so an integrator path can reach `recipient = 0x0` / non-canonical hex without `validateRecipient`.
- **F076** — `packages/sdk/src/utils/validation.ts:60-64`: `validateNotZeroAddress` compares `address === ZERO_ADDRESS` against a lowercase literal instead of `isAddressEqual(address, zeroAddress)`; it is the shared zero-check behind both `validateRecipient` and `validateWalletAddress`, and depends on byte-exact lowercase casing.
- **F006** — `packages/sdk/src/utils/validation.ts:51-58`: `validateNotSameAsset` compares only `assetIn.metadata.symbol` to `assetOut.metadata.symbol` (lowercased), never resolved on-chain addresses; symbol is attacker-influenced metadata, so the guard both over-rejects same-symbol/different-address pairs and misses same-address/different-symbol no-op swaps. Called at `SwapProvider.ts:441`.
- **F069** — `packages/sdk/src/actions.ts:204-208`: `getSupportedAssets` builds `blockedAddresses` from `getAllAssetAddresses` (`utils/assets.ts`), which flattens an asset's addresses across all chains and drops `chainId`; blocking an asset on one chain over-blocks a different asset that reuses the same address on another chain (common on the OP stack). Over-blocking only, no fund-loss, but it hides an intended-supported asset.

## Root cause

There is no single canonical-address normalization seam on the recipient/asset-identity path. Each guard reimplements address handling with a different predicate: strict `isAddress` in `validateRecipient`, non-strict `isAddress` in the resolver, lowercase-literal `===` in `validateNotZeroAddress`, symbol strings in `validateNotSameAsset`, and chain-flattened address sets in the asset filter. The resolver (which feeds signed calldata) is the most permissive of all and normalizes nothing, so non-canonical inputs survive to the Velodrome v2/leaf encoders (`encoding/routers/v2.ts:257,265,272`; `encoding/poolRouter.ts:107,121`) that trust the bytes, while the universal/CL path ignores recipient via the `UNIVERSAL_ROUTER_MSG_SENDER` sentinel (`v2.ts:225`).

## Recommended approach

Unify on canonical-address validation so a poisoned/zero/non-canonical recipient is rejected before signing. All changes are within the SDK (SDK refactor allowed).

1. **`validateNotZeroAddress` (F076):** replace `address === ZERO_ADDRESS` with `isAddressEqual(address, zeroAddress)` to match the ENS-path sibling at `ens/utils.ts:78`. One-line change; removes the lowercase-literal dependence on both the recipient and wallet-address paths.

2. **`validateRecipient` (F066):** make the guard total over its input. If `recipient` is defined and is not a strict-`isAddress` value and not a valid `EnsName`, throw `InvalidParamsError` instead of returning void. Run the zero-check via the fixed `validateNotZeroAddress`. This closes the strict/non-strict gap so the inputs the resolver admits are the inputs this guard checks.

3. **`resolveAddress` / `passthroughResolver` (F043):** normalize the hex early-return through `getAddress()` (or validate with strict `isAddress`) so every recipient leaving the resolver is EIP-55 canonical, matching the documented "checksummed hex Address" contract, and add the zero-address guard on the hex branch to match the ENS branch at `ens/utils.ts:78-83`.

4. **`validateNotSameAsset` (F006):** compare resolved on-chain addresses on the target chain (with native/wrapped normalization) via `isAddressEqual`, keeping the symbol check as a fallback. Aligns same-asset identity with the address-keyed rest of the swap surface.

5. **`getSupportedAssets` block filter (F069):** key the block set by `(chainId, address)` pairs and compare per-chain rather than on a cross-chain-flattened lowercased address set. Reuse a `marketId`-style composite key.

Defense-in-depth (optional, secondary to the upstream fixes): assert `isAddress(recipient)` at the Velodrome v2/leaf encoder boundary before `encodeFunctionData`, since that is the path that actually trusts the recipient bytes. The pre-built-quote calldata-reconciliation angle (re-deriving the recipient from a pre-built quote's calldata and asserting it matches `params.recipient`) is tracked under the same issue #437; it is a larger change and can land as a follow-up within that issue.

This ticket stays inside the missing-obvious-validation / fail-closed-where-the-SDK-already-knows / sibling-consistency scope: the SDK already computes the canonical address and already has `isAddressEqual`/`getAddress`/strict `isAddress` available; the fix is to use them consistently. No RPC-trust hardening and no speculative intent-guessing is introduced.

## Affected files

- `packages/sdk/src/utils/validation.ts:60-64` — `validateNotZeroAddress` lowercase-literal `===` (F076)
- `packages/sdk/src/utils/validation.ts:176-180` — `validateRecipient` strict-only zero-check no-op (F066)
- `packages/sdk/src/utils/validation.ts:51-58` — `validateNotSameAsset` symbol-only compare (F006)
- `packages/sdk/src/services/nameservices/ens/utils.ts:43-47` — `resolveAddress` verbatim non-strict hex, no checksum/zero guard (F043)
- `packages/sdk/src/services/nameservices/ens/utils.ts:20-25` — `passthroughResolver` un-checksummed non-strict passthrough (F043)
- `packages/sdk/src/actions.ts:204-208` — `getSupportedAssets` chain-agnostic block filter (F069)
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:441,450` — call sites for `validateNotSameAsset` / `validateRecipient`
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:257,265,272` — recipient baked into v2 calldata (encoder-boundary defense-in-depth)
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/poolRouter.ts:107,121` — recipient baked into leaf/pool calldata

## Acceptance criteria / tests

These validators currently have zero unit tests (F243); add a `validation.test.ts` covering each closed bypass:

- `validateNotZeroAddress` rejects a non-lowercase / checksummed representation of the zero address (asserts `isAddressEqual`, not literal `===`).
- `validateRecipient('vitalik.eth')` and `validateRecipient('0x123')` now throw `InvalidParamsError` (previously returned void); `validateRecipient` of a strict-valid non-zero address still passes; of the zero address still throws.
- `validateRecipient` rejects a `0x...` value that fails EIP-55 checksum (the non-strict input the resolver admits) — the test fails when the strict/non-strict gap is reintroduced.
- `resolveAddress` / `passthroughResolver` return an EIP-55 checksummed address for a lowercase hex input, and throw on the zero address on the hex branch (parity with the ENS branch).
- `validateNotSameAsset` rejects two assets that resolve to the same on-chain address with different symbols, and allows two assets sharing a symbol but with different addresses.
- `getSupportedAssets` keeps an allowed asset that reuses a blocked asset's address on a different chain (per-chain block keying); still blocks the intended asset on its own chain.

Each test must fail when the guard is reverted to its current behavior (encode why the behavior matters, not just that it runs).

## Notes

- This augments **#437**. The pre-built-quote calldata-recipient reconciliation (re-derive recipient from the quote calldata, assert equality, or refuse pre-built quotes not produced by this wallet's `getQuote`) is the larger half of #437 and is referenced here for context; the items in this ticket are the lower-risk consistency fixes that unblock it.
- Permit2 spender/amount/expiration bound checks (F067 family) are a separate signing-path validation ticket and are out of scope here, though they share the "validate before encoding" pattern.
- The CLI half of this family (`wallet swap execute --recipient` raw passthrough, recipient never echoed before/after signing — F327/F183) is review-only and tracked under #444; no architectural refactor of the CLI is requested here.
- The resolver fix is grounded in the existing asymmetry: the ENS branch at `ens/utils.ts:78-83` already uses `isAddressEqual(resolved, zeroAddress)`; the hex branch should match it rather than diverge.
