# Bound Permit2 approval spender/amount/expiration to uint160/uint48 and non-zero spender

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 2 (of 5) |
| **Domain** | core |
| **Surface** | `packages/sdk/src/utils/approve.ts:107-130` (`buildPermit2ApprovalTx`) |
| **Resolves findings** | F067 (spender/amount/uint48 encode-site legs) |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

## Problem

`buildPermit2ApprovalTx` is the function that encodes the Permit2 `approve(token, spender, amount, expiration)` calldata that the integrator's wallet signs and sends. The Permit2 `approve` ABI types `amount` as `uint160` and `expiration` as `uint48` (`packages/sdk/src/utils/abi/permit2.ts:28-29`), but the builder encodes whatever `spender`, `amount`, and computed `expiration` it is handed with no field bounds:

- **No non-zero-spender check.** A zero or mis-derived `spender` is encoded straight into the approve calldata. A Permit2 inner allowance granted to `0x0` (or the wrong contract) is a dead/wrong standing authorization the user nonetheless signs.
- **No `amount <= maxUint160` bound.** An `amount` exceeding `uint160` is either silently truncated or rejected at encode time by viem, producing a malformed or over-scoped approval in the signed payload.
- **No `expiration <= maxUint48` bound at the encode site.** The computed `expiration` is encoded into the `uint48` arg with no positivity/range assertion, so a misconfigured `permit2ExpirationSeconds` yields a past-dated (dead-on-arrival) or overflowing/malformed approval.

Fund-safety framing: these are all bounds on a payload that becomes a signed standing spend authorization to a router. A zero/wrong-spender or out-of-range approval is either rejected (availability footgun: the approve or the dependent swap reverts with no explanation) or, on silent truncation, an over-range standing approval the signer did not intend. The SDK already knows the correct field widths from the ABI; it just never asserts them before encoding. This is missing-obvious-validation at a signing-path encode site, not intent-guessing.

## Findings

- **F067 (spender/amount/uint48 encode-site legs)** — `buildPermit2ApprovalTx` encodes `spender`, `amount`, and the computed `expiration` into the Permit2 `approve` calldata with no non-zero-spender check, no `amount <= maxUint160` bound, and no `expiration <= maxUint48` bound, despite the ABI typing `amount`/`expiration` as `uint160`/`uint48` (`packages/sdk/src/utils/approve.ts:107-130`, ABI at `packages/sdk/src/utils/abi/permit2.ts:28-29`).

## Root cause

`buildPermit2ApprovalTx` trusts its inputs to already be in range and `spender` to already be a real address, and hands them directly to `encodeFunctionData` (`approve.ts:119-123`). The function is the single choke point where these three fields enter the signed Permit2 payload, but it carries none of the field-width or non-zero guards that the ABI types imply. The SDK already imports `maxUint160` here (`approve.ts:2`) and already has `validateAddress` + `validateNotZeroAddress` (`packages/sdk/src/utils/validation.ts:60-75`); the bounds are simply never applied at this seam.

## Recommended approach

SDK refactor (in scope: signing-path payload bounds, missing-obvious-validation, fail-closed-where-the-SDK-already-knows). Add the three field bounds at the top of `buildPermit2ApprovalTx`, before `encodeFunctionData`:

1. **Non-zero spender.** Reuse `validateAddress(spender, 'spender')` + `validateNotZeroAddress(spender, 'spender')` so a zero/syntactically-invalid spender throws `InvalidParamsError` before encoding, mirroring `validateWalletAddress` (`validation.ts:100-108`).
2. **`amount <= maxUint160`.** Assert the bigint `amount` is non-negative and `<= maxUint160` (already imported), throwing `InvalidParamsError` otherwise. `resolvePermit2ApprovalAmount` (`approve.ts:97-102`) already knows the `uint160` ceiling for max-mode; share that ceiling rather than re-deriving it.
3. **`expiration <= maxUint48`.** Assert the computed `expiration` is a positive integer `<= maxUint48` (import `maxUint48` from viem alongside the existing `maxUint160`), throwing `InvalidParamsError` otherwise.

Coordination with the existing expiration ticket: the expiration *semantics* (deriving/clamping the value from `permit2ExpirationSeconds` and binding it to the swap `deadline`, plus the positive-integer config-seam check) are owned by `docs/tickets/permit2-approval-owner-and-expiry.md` (augments #436, resolves F050/F067/F187). This ticket adds only the encode-time `uint48` range assertion at `buildPermit2ApprovalTx` as the last-line defense; if both land, the encode-site `<= maxUint48` check and the config-seam positive-integer check are complementary (one guards the input, one guards the encoded value) and should be kept consistent. The two tickets touch the same function (`approve.ts:107-130`), so they should be reviewed together to avoid a merge collision and duplicate assertions.

Consistency note: these bounds belong on the single shared `buildPermit2ApprovalTx` builder so every caller (Uniswap and Velodrome swap providers, which both route through it) inherits the same guards. Do not duplicate the checks per-provider.

## Affected files

- `packages/sdk/src/utils/approve.ts:107-130` (`buildPermit2ApprovalTx`; add spender/amount/expiration bounds before `encodeFunctionData` at 119-123; `maxUint160` already imported at line 2, add `maxUint48`)
- `packages/sdk/src/utils/abi/permit2.ts:28-29` (reference only: `amount` `uint160` / `expiration` `uint48` typing that motivates the bounds)
- `packages/sdk/src/utils/validation.ts:60-75,100-108` (reuse `validateAddress` / `validateNotZeroAddress`; no change required if reused as-is)
- `packages/sdk/src/utils/__tests__/approve.test.ts` (new spender/amount/expiration bound assertions)

## Acceptance criteria / tests

- Non-zero spender: `buildPermit2ApprovalTx` with `spender = 0x0` (or a syntactically invalid spender) throws `InvalidParamsError` before any calldata is encoded; a valid non-zero spender encodes cleanly.
- Amount bound: `amount = 2n ** 161n` (or any value `> maxUint160`) throws `InvalidParamsError`; `amount = maxUint160` and an in-range exact amount both encode cleanly.
- Expiration bound: a computed `expiration > maxUint48` throws `InvalidParamsError` before encoding; the default-derived expiration encodes cleanly.
- Decode the emitted calldata for the happy path and assert the encoded `spender`/`amount`/`expiration` round-trip to exactly the inputs (no silent truncation).
- A mutation that removes any one of the three guards must fail at least one test (the guards are load-bearing, not redundant).

## Notes

- Permit2 `approve` payloads are signing-path surface, so these encode-time field bounds are in scope per the signing-path rule.
- This ticket is the spender/amount/encode-site-`uint48` half of F067; the expiration-semantics half (deadline binding + config-seam positive-integer check) is in `docs/tickets/permit2-approval-owner-and-expiry.md`. The ledger tracks these as the `F067` (expiration, `approve.ts:115-117`) and `(refines:F067)` (spender/amount, `approve.ts:107-130`) rows; both must keep their assertions consistent and avoid colliding on the same function.
- RPC-sourced values are out of scope per the documented integrator-RPC assumption; this ticket bounds only the locally-computed/handed fields the SDK already controls at the encode site.
- Out of scope: changing the default approval mode or removing `maxUint160` max-mode (an integrator-selected approval mode), and any deadline-clamp semantics (owned by the sibling ticket above).
