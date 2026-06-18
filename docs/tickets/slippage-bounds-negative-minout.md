# Clamp slippage to [0,1) so computeSlippageBounds cannot produce a negative amountOutMin

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Complexity** | 3 / 5 |
| **Domain** | swap |
| **Surface** | `SwapProvider.computeSlippageBounds`, `validation.ts` `validateSlippage` / `validateAmountPositiveIfExists`, uniswap encoder min-out |
| **Resolves findings** | F001, F005, F110, F111, F186 |
| **Candidate existing issue** | #318 |
| **Blocked by** | (none) |

## Problem

The slippage tolerance a caller supplies flows into `computeSlippageBounds`, which derives the `amountOutMinRaw` floor that gets baked into signed router calldata. That floor is the only on-chain protection against a swap settling for far less than quoted (MEV / sandwich / stale price). The SDK currently never enforces an absolute `slippage < 1` ceiling and never rejects a non-finite (`NaN` / `Infinity`) slippage at the validation boundary.

When `slippage >= 1.0` reaches the bounds math, `slippageBps` exceeds `BPS_DENOMINATOR` (10000), so `(BPS_DENOMINATOR - slippageBps)` goes negative and `amountOutMinRaw` becomes a **negative** value. A negative minimum-out floor is satisfied by ANY output amount, including near-zero, so the swap is signed with slippage protection effectively disabled while the SDK still reports a (meaningless) bound to the caller. This is a fund-loss path: the user signs a swap that can settle for almost nothing and nothing in the SDK flags it.

This is reachable today because:
- `validateSlippage` only checks `slippage < 0 || slippage > maxSlippage`. `maxSlippage` is integrator-configurable with no `<= 1` ceiling, so an integrator who sets `maxSlippage = 2.0` admits `slippage = 1.5`. The built-in default `0.5` is safe, but the guard's contract should not depend on integrator config staying sane.
- `getQuote()` skips `validateSwapExecute` entirely, so even with a sane `maxSlippage` a slippage in `(maxSlippage, 1.0)` or `>= 1.0` reaches `computeSlippageBounds` at quote time and the negative/zero floor is encoded into the returned quote's calldata, which can then be passed to `execute()`.
- The Uniswap encoder recomputes the min-out a second time from the same raw `slippage` (`encoding.ts:252`), so it produces the same negative `minAmountOut` and the displayed-vs-enforced numbers are derived from two independent computations that can also diverge by rounding.

## Findings

- **F001** (`packages/sdk/src/actions/swap/core/SwapProvider.ts:164-167`) — `getQuote()` calls only `assertChainSupported` then `_getQuote`, skipping the `validateSwapExecute` gate that `execute()` runs; `slippage` reaches `computeSlippageBounds` with no range check and `slippage > 1.0` yields a negative `amountOutMinRaw`.
- **F005** (`packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:252`) — encoder recomputes `minAmountOut = amountOutRaw * round((1 - slippage) * 10000) / 10000` independently of `computeSlippageBounds`, so the displayed bound and the enforced bound come from two separate calculations (and both go negative for `slippage >= 1`).
- **F110** (`packages/sdk/src/utils/validation.ts:111-115`) — `validateSlippage` admits `NaN`: `slippage < 0 || slippage > max` is `false` for `NaN`, so the shared slippage choke point silently passes a non-finite value.
- **F111** (`packages/sdk/src/utils/validation.ts:36-40`) — `validateAmountPositiveIfExists` admits `NaN` / `+Infinity`: `amount <= 0` is `false` for both, so non-finite amounts bypass the shared positivity guard.
- **F186** (`packages/sdk/src/actions/swap/core/SwapProvider.ts:286-298,440-451`) — no test exercises `slippage >= 1.0` / `NaN` / negative-min-out on `computeSlippageBounds` via the `getQuote` path (`validateSwapExecute` is skipped there); the negative-`amountOutMinRaw` fund-loss boundary is uncovered, and `computeSlippageBounds` has no direct test.

## Root cause

The SDK trusts `validateSlippage` to bound slippage before the value reaches the arithmetic in `computeSlippageBounds`, but `validateSlippage` (`validation.ts:111-115`) only enforces a relative bound against the integrator-set `maxSlippage` and uses comparisons that are silently `false` for `NaN`. There is no absolute `[0, 1)` invariant anywhere on the signing path, `computeSlippageBounds` (`SwapProvider.ts:286-298`) does no defensive clamp of its own, and `getQuote()` (`SwapProvider.ts:164-167`) does not run `validateSlippage` at all, so the one guard that exists is not even applied on the quote path. The encoder then recomputes the same bound from the raw `slippage` a second time, so the bug surfaces identically in the calldata even if the reported bound were fixed in isolation.

## Recommended approach

SDK fix. This is a missing-obvious-validation + fail-closed-where-the-SDK-already-knows fix, plus a sibling-consistency cleanup; all in scope.

1. **Add an absolute ceiling and finiteness guard in `validateSlippage`** (`validation.ts:111-115`): reject when `!Number.isFinite(slippage)`, `slippage < 0`, `slippage >= 1`, or `slippage > maxSlippage`. The `>= 1` ceiling is absolute and independent of the integrator's `maxSlippage`, so a misconfigured `maxSlippage > 1` can no longer admit a slippage that produces a negative floor. Continue throwing `SlippageOutOfRangeError`.

2. **Add the finiteness guard to `validateAmountPositiveIfExists`** (`validation.ts:36-40`): reject when `amount !== undefined && (!Number.isFinite(amount) || amount <= 0)`, throwing `InvalidAmountError`. This is the sibling positivity guard on the same signing path and is fixed here for consistency (F111).

3. **Run the slippage guard on the `getQuote` path** (`SwapProvider.ts:164-167`): call `validateSlippage(params.slippage ?? this.defaultSlippage, this.maxSlippage)` (and `validateAmountPositiveIfExists` on the provided amounts) inside `getQuote` before `_getQuote`, so a quote can no longer encode a negative-floor calldata that `execute()` would have rejected. Scope this addition to the value-relevant slippage/amount guards; the broader blocklist/recipient asymmetry of F001 is tracked separately and is not required to close the negative-min-out path.

4. **Defense-in-depth clamp in `computeSlippageBounds`** (`SwapProvider.ts:286-298`): after the validation guards, the function should still never be able to return a negative floor. Assert (or clamp) `amountOutMinRaw` into `[0, amountOutRaw]` so the arithmetic is self-protecting even if a future caller reaches it without validation. Prefer a hard assert/throw over a silent clamp so a violated invariant fails loud rather than quietly disabling protection.

5. **Single source of truth for the encoded bound** (`encoding.ts:252,273`): pass the already-derived `amountOutMinRaw` (and a symmetric `amountInMaxRaw`) from the provider into the encoder instead of recomputing from raw `slippage`, so the displayed bound and the enforced calldata bound are the same number (F005) and the negative-floor fix in `computeSlippageBounds` cannot be re-introduced by the encoder's independent recompute. Apply the same wiring to the Velodrome encoder if it recomputes independently, to keep sibling providers consistent.

## Affected files

- `packages/sdk/src/utils/validation.ts:111-115` — `validateSlippage`: add finiteness + `>= 1` absolute ceiling.
- `packages/sdk/src/utils/validation.ts:36-40` — `validateAmountPositiveIfExists`: add finiteness guard.
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:164-167` — `getQuote`: run `validateSlippage` (and amount positivity) before `_getQuote`.
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:286-298` — `computeSlippageBounds`: assert/clamp `amountOutMinRaw` into `[0, amountOutRaw]`.
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:440-451` — `validateSwapExecute`: ensure the guard set stays the single definition reused by `getQuote`.
- `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:252,273` — consume the provider-derived bound instead of recomputing from `slippage`.
- `packages/sdk/src/core/error/errors.ts:246-258` — `SlippageOutOfRangeError` (reused; verify the `[0, maxSlippage*100%]` message still reads correctly with the absolute ceiling).
- `packages/sdk/src/utils/__tests__/validation.test.ts:1-50` — add the validator unit tests below (file currently covers only `resolveSupportedChainIds` / `validateWalletAddress`).

## Acceptance criteria / tests

- `validateSlippage` throws `SlippageOutOfRangeError` for each of: `NaN`, `Infinity`, `-Infinity`, `-0.1`, `1.0`, `1.5`, and for any `slippage > maxSlippage`. It accepts `0`, `0.005`, `0.5`, and a value just under `1` when `maxSlippage` allows it.
- `validateSlippage(1.5, 2.0)` throws even though `1.5 <= maxSlippage`, proving the absolute `>= 1` ceiling is independent of `maxSlippage`.
- `validateAmountPositiveIfExists` throws `InvalidAmountError` for `NaN`, `Infinity`, `-Infinity`, `0`, and negatives; accepts `undefined` and any positive finite number.
- Direct `computeSlippageBounds` tests over `slippage ∈ {0, 0.005, 0.5}` (and any value the guards now admit) assert `0 <= amountOutMinRaw <= amountOutRaw`. A test feeding a `slippage >= 1` (or `NaN`) directly to `computeSlippageBounds`, bypassing validation, asserts it throws rather than returning a negative floor.
- `getQuote({ slippage: 1.5, ... })` and `getQuote({ slippage: NaN, ... })` reject (throw) instead of returning a quote whose `amountOutMinRaw` is negative or whose encoded `minAmountOut` is negative (F186 boundary, previously uncovered).
- Encoded calldata test: for a fixed quote, the `minAmountOut` (exact-in) / `maxAmountIn` (exact-out) baked into calldata equals the provider's reported `amountOutMinRaw` / `amountInMaxRaw` (no independent recompute divergence, F005).
- Full SDK `pnpm` typecheck / lint / test / build pass.

## Notes

- F001's broader claim (getQuote also skips blocklist / recipient / same-asset validation) is a wider validation-asymmetry item tracked under #435; this ticket deliberately scopes the `getQuote` change to the slippage/amount guards needed to close the negative-min-out fund-loss path and does not attempt the full asymmetry fix.
- The candidate existing issue is #318 (the swap encoder min-out / differential-oracle cluster), which is the natural home for the F005 encoder-recompute half. The validator changes (F110/F111) overlap issues #303 / #373 / #379; reference those when wiring up the PR but the fix itself is a single coherent change set.
- No `maxSlippage`-clamp-at-read-site is strictly required if the absolute `>= 1` ceiling lands in `validateSlippage`; clamping `maxSlippage <= 1` where it is read is an equivalent alternative, not an additional requirement.
- RPC trust and intent-guessing are out of scope; this ticket is purely about an invariant the SDK already has all the information to enforce (`0 <= slippage < 1` and finite amounts) failing closed on the signing path.
