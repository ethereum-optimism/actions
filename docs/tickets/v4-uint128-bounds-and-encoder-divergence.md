# Bound V4 uint128 amount params and reconcile encoder min-out/max-in with computeSlippageBounds

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | swap |
| **Surface** | `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:250-294` (uint128 amount params, independent slippage recompute) |
| **Resolves findings** | F051, F005 |
| **Candidate existing issue** | #318 |
| **Blocked by** | `slippage-bounds-negative-minout` |

## Problem

The Uniswap V4 encoder is the last hop before a swap is signed: whatever `amountOutMinimum` (exact-in) or `amountInMaximum` (exact-out) it bakes into the Universal Router calldata is the only on-chain protection that actually governs the trade. Two issues in this one function let that protection silently differ from what the SDK reports, or wrap entirely:

1. **No `<= maxUint128` bound on the V4 amount params.** The V4 `EXACT_INPUT_SINGLE_PARAMS` / `EXACT_OUTPUT_SINGLE_PARAMS` tuples type `amountIn`, `amountOutMinimum`, `amountOut`, and `amountInMaximum` as `uint128`. The encoder hands raw `bigint`s straight to `encodeAbiParameters` with no check that they fit in 128 bits. A token amount above `2^128 - 1` (~3.4e38 base units; reachable for ultra-high-supply or high-decimal tokens) either makes viem throw an opaque encoding error (an unvalidated DoS with no domain-specific message) or, if a wrapped value were ever encoded, would corrupt the very min-out/max-in bound that protects the swap. The SDK already knows the param is `uint128`, so it can fail closed with a clear error before signing rather than relying on viem's overflow behavior.

2. **The displayed bound and the enforced bound are computed twice, by two different formulas.** `SwapProvider.computeSlippageBounds` derives `amountOutMinRaw` and surfaces it on the quote as `amountOutMin` (what a frontend/agent shows the user). The encoder then recomputes its own `minAmountOut` (exact-in) and `maxAmountIn` (exact-out) from the raw `slippage` float, using different rounding. The signed calldata binds, not the displayed number, so the worst case the user was shown is not guaranteed to equal the worst case actually enforced on-chain. For exact-output there is no surfaced `amountInMaximum` at all, so the divergence is invisible. This is the V4-encoder half of the broader slippage single-source-of-truth problem.

## Findings

- **F051** (`packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:262-263, 283-284`; types at `providers/uniswap/abis.ts:90-91, 108-109`) — the `amountIn` / `amountOutMinimum` / `amountOut` / `amountInMaximum` fields of the V4 `EXACT_*_SINGLE_PARAMS` tuples are `uint128`, and the encoder passes raw `bigint`s into them with no `<= maxUint128` guard; an over-range value throws opaquely or risks a wrapped, corrupted bound.
- **F005** (`packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:251-252, 271-273` vs `core/SwapProvider.ts:286-298`) — the encoder recomputes `minAmountOut = quote.amountOutRaw * round((1 - slippage) * 10000) / 10000` and `maxAmountIn = quote.amountInRaw + quote.amountInRaw * round(slippage * 10000) / 10000` independently of `computeSlippageBounds`, so the displayed `amountOutMin` is not guaranteed to equal the `amountOutMinimum` baked into the signed calldata.

## Root cause

Both halves stem from the encoder owning calculations it should be consuming, not deriving:

- The encoder never asserts the `uint128` contract that its own ABI tuples declare. The bound check lives nowhere on the path, so the type constraint is enforced only incidentally by viem at encode time, with no SDK-level error.
- The on-chain slippage bound is computed in two places from two representations: `computeSlippageBounds` works in integer basis points (`round(slippage * 10000)`, then integer division), while the encoder multiplies by `round((1 - slippage) * 10000)`. For clean slippage (e.g. `0.005`) they agree; for odd `slippage` or odd raw amounts they can differ by a rounding step. The provider already derives the authoritative `amountOutMinRaw`; the encoder recomputing it from the raw float is a redundant second source that can drift.

Note the precise surface: only the `EXACT_*_SINGLE_PARAMS` tuple amount fields are `uint128`. The sibling `CURRENCY_AMOUNT_PARAMS` (SETTLE_ALL / TAKE_ALL, `encoding.ts:267, 288-291`) type their amount as `uint256`, so the same raw value is `uint128`-bounded in one param and `uint256`-bounded in the next within the same call. The bound check belongs at the `uint128` params.

## Recommended approach

SDK fix. Both pieces are in scope: F051 is missing-obvious-validation that fails closed where the SDK already knows the `uint128` constraint, and F005 is a single-source-of-truth / sibling-consistency cleanup on the signing path.

This ticket is **blocked by** `slippage-bounds-negative-minout`. That ticket already lands the prerequisite for the F005 half: it makes `computeSlippageBounds` the single, self-protecting source of `amountOutMinRaw` (clamped to `[0, amountOutRaw]`) and threads the provider-derived bound into the encoder so the encoder stops recomputing from raw `slippage` (its step 5, `encoding.ts:252,273`). Do that wiring first. This ticket then:

1. **Add a `uint128` bound check before encoding the V4 amount params** (`encoding.ts:250-294`). Before each `encodeAbiParameters(EXACT_*_SINGLE_PARAMS, ...)`, assert that every value entering a `uint128` field (`amountIn`, `amountOutMinimum` for exact-in; `amountOut`, `amountInMaximum` for exact-out) is `>= 0n && <= maxUint128`. Throw a clear domain error (e.g. an `AmountTooLargeError` / `AmountExceedsUint128Error` naming the offending field and the cap) rather than letting viem throw an opaque overflow. Use `maxUint128` from viem so the cap is not a hand-typed literal.

2. **Confirm the F005 single-source wiring is complete in the V4 encoder** once the blocker lands. The encoder must consume the provider's `amountOutMinRaw` (exact-in) and `amountInMaxRaw` (exact-out) directly into the `EXACT_*_SINGLE_PARAMS` tuple and the `CURRENCY_AMOUNT_PARAMS`, with no local `round((1 - slippage) * 10000)` / `round(slippage * 10000)` recompute remaining at `encoding.ts:251-252, 271-273`. The displayed bound and the encoded bound must be the same `bigint`.

3. **Keep sibling providers consistent.** Apply the same `uint128`-bound assertion to any other V4 / Universal Router param path that encodes a `uint128` amount, and confirm the Velodrome encoder (which uses `uint256` params) does not independently recompute the slippage bound either; if it does, route it through the same provider-derived `amountOutMinRaw` / `amountInMaxRaw` so all providers display-equals-enforce.

No demo/CLI change is required for this ticket. The frontend modal layer that recomputes "minimum received" from a literal (F302/#435) is a separate review-only item and is not in scope here.

## Affected files

- `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:250-294` — add the `uint128` bound check before encoding each `EXACT_*_SINGLE_PARAMS` tuple; consume the provider-derived `amountOutMinRaw` / `amountInMaxRaw` instead of the local recompute at `:251-252, 271-273`.
- `packages/sdk/src/actions/swap/providers/uniswap/abis.ts:90-91, 108-109` — the `uint128`-typed fields the bound check protects (reference; no change required unless the field set changes).
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:286-298` — `computeSlippageBounds`, the single source the encoder must consume (the blocker ticket owns the clamp/threading; this ticket depends on it).
- `packages/sdk/src/core/error/errors.ts` — add/define the `uint128`-overflow domain error (`AmountTooLargeError` or equivalent) if one does not already exist.
- `packages/sdk/src/actions/swap/providers/uniswap/__tests__/` — add the encoder bound + parity tests below.

## Acceptance criteria / tests

- A swap whose raw amount (or derived min-out / max-in) exceeds `maxUint128` throws the clear domain error naming the field, **not** an opaque viem overflow, and the error fires before any calldata is produced. Both exact-in (`amountIn` over cap) and exact-out (`amountInMaximum` over cap) are covered.
- A swap at exactly `maxUint128` encodes successfully; a swap at `maxUint128 + 1n` throws. Boundary asserted on both the exact-in and exact-out paths.
- For a fixed quote, the `amountOutMinimum` decoded from the exact-in calldata equals the provider's reported `amountOutMinRaw` (no rounding divergence), and the `amountInMaximum` decoded from the exact-out calldata equals the provider's `amountInMaxRaw`. Choose a `slippage` / `amountOutRaw` pair where the old `round((1 - slippage) * 10000)` formula and `computeSlippageBounds` would have diverged, and assert they now match (encodes the F005 fix as a regression guard, not just current behavior).
- No `Math.round((1 - slippage) * 10000)` / `Math.round(slippage * 10000)` recompute remains in `encodeUniversalRouterSwap`; the bound enters the encoder as a precomputed `bigint`.
- Full SDK `pnpm` typecheck / lint / test / build pass.

## Notes

- Severity is medium because the F005 display-vs-enforced divergence is the load-bearing half (a user can sign a worse bound than shown); the F051 `uint128` overflow is low-likelihood (requires an ultra-high-supply / high-decimal token amount above ~3.4e38 base units) but is cheap, obvious validation the SDK can do once it already knows the param is `uint128`, and is folded in here because it lives in the same lines.
- The candidate existing issue is **#318** (the swap encoder min-out / differential-oracle cluster), the natural home for the F005 encoder-recompute and the V4 bound check. This ticket does not augment a separate issue; it is a new ticket whose F005 half depends on `slippage-bounds-negative-minout` having landed the single-source-of-truth threading first.
- F051 was filed as low severity on its own (`refines:F051`, ledger); it is consolidated into this medium ticket only because the fix touches the exact same `encoding.ts:250-294` block as the F005 reconciliation, not because the overflow risk is itself medium.
- RPC trust and intent-guessing are out of scope. This ticket only enforces an invariant the SDK already has the information to enforce (`value <= maxUint128`) and removes a redundant second computation of a bound the provider already derived.
