# Validate APY/reserve math finiteness and fix Aave share-price/utilization fields

> **AUGMENT existing issue #209 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | lend |
| **Surface** | `aave/sdk.ts` `getReserve` (supply.totalAssets/totalShares mis-fill); `morpho/sdk.ts` `calculateApyBreakdown` performance-fee reversal `1/(1-fee)`; `morpho/sdk.ts` `calculateRewardsBreakdown` GraphQL reward coalescing; `morpho/api.ts` `fetchRewards` untyped boundary |
| **Resolves findings** | F116, F101 |
| **Candidate existing issue** | #209 |
| **Blocked by** | (none) |

## Problem

The number a lender reads to decide whether to deposit — `LendMarket.apy` and the derived `supply` share-price/utilization — is computed two different ways across the two lend providers, and on the Morpho side the math can return `Infinity`, `NaN`, or a negative APY from a single out-of-range input.

Two concrete failures:

1. **Aave reports garbage share-price/utilization.** `getReserve` fills `supply.totalAssets` with `availableLiquidity` (only the idle/unborrowed portion, not total supplied) and `supply.totalShares` with `totalScaledVariableDebt` (borrow-side scaled debt, not a supply-share count). The `LendMarketSupply` contract documents these as "Total underlying assets in the vault" and "Total vault shares issued"; neither field carries that meaning here. Any consumer that computes a share price or utilization as `totalAssets / totalShares` gets a meaningful number for Morpho (which fills these correctly) and a cross-unit ratio with no financial meaning for Aave. A reserve with 1M supplied / 600k borrowed reports `totalAssets = 400k` (idle) and `totalShares = scaledVariableDebt`.

2. **Morpho APY can be non-finite or sign-flipped.** `calculateApyBreakdown` reverses the performance fee via `baseApyAfterFees / (1 - performanceFee)` with no guard that `performanceFee < 1`. When `fee == 1e18` (`performanceFee == 1`) the division is `x/0 → Infinity` (or `0/0 → NaN`); when `fee > 1e18` the result sign-flips and `netApy` becomes nonsensical. That `netApy` is returned as `apy.total` and copied into `LendTransaction.apy`. Compounding this, the external GraphQL reward magnitudes (`supplyApr`, `supplyAssetsUsd`, `fee`) are consumed as `any` with only `|| 0` falsy coalescing — a string `"999"` or a non-finite value survives the coalesce and is summed straight into the displayed APY.

The fund-safety framing: APY and share-price are the figures a developer surfaces to a user at deposit time. A non-finite or garbage value is not just a display glitch — it can drive an allocation decision, feed a downstream "best vault" ranking, or render as `Infinity%`/`NaN%`. The SDK already has the correct fields (Aave) and already knows the protocol bound on the fee (Morpho), so both are missing-obvious-validation / fail-closed-where-the-SDK-already-knows, not speculative intent-guessing.

## Findings

- **F116** (medium, correctness) — `packages/sdk/src/actions/lend/providers/aave/sdk.ts:173-176`: `getReserve` returns `supply = { totalAssets: BigInt(reserve.availableLiquidity), totalShares: BigInt(reserve.totalScaledVariableDebt || '0') }` — idle liquidity in `totalAssets` and borrow-side scaled debt in `totalShares`, contradicting the `LendMarketSupply` field docs (`packages/sdk/src/types/lend/base.ts:60-63`) and diverging from the Morpho sibling (`packages/sdk/src/actions/lend/providers/morpho/sdk.ts:282,366-367`) which fills `vault.totalAssets`/`vault.totalSupply`.
- **F101** (low, info) — `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:538-579`: external GraphQL reward values (`reward.supplyApr` at `:540,569`, `alloc.supplyAssetsUsd` at `:553,565`) are read as `any` with only `|| 0` coalescing — no finiteness/sign/type guard before they sum into `totalRewards` and surface in `apy.total`. The boundary itself is untyped: `fetchRewards` returns `Promise<any | null>` (`packages/sdk/src/actions/lend/providers/morpho/api.ts:20`) and the math helpers take `vault: any` (`:467,514`).
- **F101 (refinement, internal-math leg)** — `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:472-491`: `calculateApyBreakdown` computes `baseApyBeforeFees = baseApyAfterFees / (1 - performanceFee)` (`:474`) with `performanceFee = Number(vault.fee) / 1e18` (`:473`); `calculateBaseApy` does the parallel `baseApy * (1 - vaultFeeRate)` (`:112-113`). No guard that `fee < 1e18`, so `fee == 1e18 → Infinity/NaN` and `fee > 1e18 → sign-flip`. The on-chain fallback `fetchVaultInfo`/`fetchVaultDataOnChain` reads `fee()` raw with no upper-bound assertion (`:137,276`).

## Root cause

Two independent defects sharing one symptom (a wrong/non-finite `LendMarket.apy` or `supply` ratio), both grounded in the SDK trusting a value it could validate:

- **Aave field sourcing (F116):** `getReserve` was wired to whatever reserve fields were handy (`availableLiquidity`, `totalScaledVariableDebt`) rather than the fields the `LendMarketSupply` contract names. The Morpho sibling sources the correct fields, so this is a sibling-consistency gap on the same public type.
- **Morpho APY finiteness (F101):** the fee-reversal division assumes `performanceFee < 1` without enforcing it, and the external reward path coerces untrusted GraphQL numbers with `|| 0` instead of a finite/non-negative check. Real MetaMorpho vaults cap the fee at 50%, but the on-chain fallback reads `fee()` with no upper bound and the helpers accept it as `any`, so a single bad read (or a hostile/buggy API response) produces `Infinity`/`NaN`/negative APY that flows into `getMarket().apy.total` and `LendTransaction.apy`.

## Recommended approach

All changes are within the SDK (SDK refactor allowed). The work is: fix the Aave field sourcing to match the documented contract and the Morpho sibling, and add finiteness/range guards to the Morpho APY math at the points where the SDK already knows the bound.

1. **Aave `supply` field sourcing (F116):** populate `totalAssets` from total aToken supply (`reserve.totalLiquidity`, or `availableLiquidity + totalVariableDebt + totalStableDebt`) and `totalShares` from the aToken scaled total supply, matching the Morpho semantics (`morpho/sdk.ts:282`). If Aave aTokens are treated as 1:1 with underlying (as `_getPosition` already assumes), set `totalShares == totalAssets` explicitly and document that invariant in a comment so the share-price reads as 1.0 by construction rather than as a cross-unit ratio. Either way, `totalAssets`/`totalShares` must mean what `LendMarketSupply` says they mean and must be unit-consistent with the Morpho provider.

2. **Performance-fee reversal guard (F101 internal-math leg):** before dividing, clamp/validate `performanceFee` into `[0, 1)`. Treat an on-chain `fee()` read of `>= 1e18` as a data error (reject, or floor at the protocol max), and guard `1 - performanceFee > 0` so the division can never be `x/0`. Assert `Number.isFinite` on the resulting `baseApyBeforeFees`/`netApy` and surface a clear error (or a defined fallback) rather than returning `Infinity`/`NaN`/negative as `apy.total`.

3. **External reward finiteness coalescing (F101 external-value leg):** at the boundary in `calculateRewardsBreakdown`/`calculateApyBreakdown`, read each `supplyApr`/`supplyAssetsUsd`/`fee` via `Number(x)` + `Number.isFinite` + a non-negative check, dropping or zeroing invalid entries instead of `|| 0` (which lets a string `"999"` and arithmetic-coercion artifacts through). Optionally narrow `fetchRewards`'s return from `any` to a validated shape; the finiteness guard is the load-bearing fix, the typing is the durability improvement. (The pure type-precision framing of this boundary is tracked separately under #337 as the API-design lens; this ticket lands the finiteness/range guards.)

This ticket stays inside missing-obvious-validation / fail-closed-where-the-SDK-already-knows / sibling-consistency. No RPC-trust hardening (integrators bring their own RPC; the on-chain `fee()` read is guarded for *range*, not for RPC honesty), no speculative intent-guessing, and no broad refuse-to-sign — APY/reserve math is a read/display path, and the fix is to source the documented fields and bound a value whose protocol max the SDK already knows.

## Affected files

- `packages/sdk/src/actions/lend/providers/aave/sdk.ts:173-176` — `getReserve` fills `supply.totalAssets` with idle liquidity and `totalShares` with borrow-side scaled debt (F116)
- `packages/sdk/src/types/lend/base.ts:59-64` — `LendMarketSupply` field-doc contract the Aave fill violates (F116 reference)
- `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:282,366-367` — Morpho sibling fills `totalAssets`/`totalShares` correctly (F116 reference)
- `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:472-491` — `calculateApyBreakdown` performance-fee reversal `1/(1-fee)` with no `fee < 1e18` guard (F101 internal-math)
- `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:108-113` — `calculateBaseApy` parallel `* (1 - vaultFeeRate)` and `Number(vault.fee)` (F101)
- `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:137,276` — on-chain `fee()` fallback read with no upper-bound assertion (F101)
- `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:538-579` — `calculateRewardsBreakdown` `supplyApr`/`supplyAssetsUsd` consumed as `any` with `|| 0` coalescing (F101 external-value)
- `packages/sdk/src/actions/lend/providers/morpho/api.ts:20` — `fetchRewards` returns `Promise<any | null>`, the untyped GraphQL boundary (F101)

## Acceptance criteria / tests

Each test must fail when the guard is reverted to current behavior (encode why the value matters, not just that the function runs).

- **Aave field semantics (F116):** for a reserve fixture with nonzero borrows (e.g. 1M supplied / 600k borrowed), `getMarket` returns `supply.totalAssets` equal to total supplied (not idle `availableLiquidity`) and `supply.totalShares` consistent with the documented "vault shares issued" semantics. Assert the resulting share-price (`totalAssets / totalShares`) is a sane, unit-consistent number — under the 1:1 aToken invariant it should be exactly 1.0 — and that it is computed the same way as the Morpho sibling for an equivalent fixture (sibling-consistency assertion, not a fixture-bound `apy > 0`).
- **Performance-fee bound (F101):** `calculateApyBreakdown` with `vault.fee == 1e18` does not return `Infinity`/`NaN` for `apy.total`/`apy.native` (rejects or falls back); with `vault.fee > 1e18` it does not return a sign-flipped/negative `native`; with a normal fee (e.g. `0.1e18`) the breakdown is unchanged from current correct behavior. Assert `Number.isFinite(apy.total)` for every branch.
- **External reward finiteness (F101):** stub `fetchRewards` to return a reward with `supplyApr: '999'` (string), a negative `supplyApr`, and a `NaN`/`Infinity` `supplyAssetsUsd`; assert each invalid entry is dropped/zeroed and `apy.total`/`totalRewards` remain finite and non-negative — not polluted by string coercion or a non-finite summand.
- These replace the current fixture-bound `apy.toBeGreaterThan(0)` assertions in the lend suites (which only prove the fixture has a positive APY, per F201/F193) with assertions that the math itself is finite and the two providers agree on share-price units.

## Notes

- This augments **#209**. F116 and the F201 companion (Aave `getPosition` share/balance path has no exact-balance test, so Aave APY/share-price is fixture-bound only) both carry candidate issue #209; landing the F116 field fix here is the precondition for the F201 test to assert a real share-price rather than codifying the current garbage ratio.
- The pure type-precision / schema-validation framing of the Morpho GraphQL boundary (narrowing `fetchRewards` from `any`, the `ApyBreakdown` index-signature widening, response-schema validation) is tracked under **#337** as the API-design lens. This ticket lands the runtime finiteness/range guards (the fund-safety leg); the typing work can follow under #337 and is called out in step 3 as the durability improvement, not the load-bearing fix.
- The on-chain `fee()` upper-bound check is a *range* guard on a value whose protocol maximum the SDK already knows (MetaMorpho caps the fee), not an RPC-honesty assumption — integrators bring their own RPC, and a malicious RPC returning a bad `fee()` is out of scope except insofar as the range guard already rejects an out-of-range read.
- No demo/CLI changes are requested. The demo frontend consumes `LendMarket.apy`/`supply` from this SDK path; once the field sourcing and finiteness guards land, the SDK is the enforcing layer and no demo refactor is needed (review-only awareness that the demo currently renders whatever the SDK returns).
