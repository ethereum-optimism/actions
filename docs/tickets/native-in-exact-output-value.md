# Fix native-in exact-output msg.value placeholder (use amountInMaximum)

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Complexity** | 3 (of 5) |
| **Domain** | swap |
| **Surface** | `UniswapSwapProvider.ts:172` (`execution.value`); `SwapProvider.resolveQuoteDefaults` shared `?? 1` default; `encoding.ts` exact-out `amountInMaximum` |
| **Resolves findings** | F004, F048 |
| **Candidate existing issue** | none |
| **Blocked by** | none |

## Problem

A Uniswap exact-output swap with a **native input asset** (e.g. swap ETH for an exact amount of USDC) attaches the wrong `msg.value` to the execution payload. Instead of the slippage-buffered maximum input the encoded calldata authorizes (`amountInMaximum`), it attaches a fixed **1-unit placeholder** value.

This is fund-safety relevant in both directions:

- **Underfunded revert (common case):** the V4 `SETTLE_ALL` action requires `msg.value` to cover the `amountInMaximum` baked into the calldata. When the true input cost exceeds the 1-unit placeholder (essentially always for a real trade), the swap reverts on-chain. The user pays gas for a transaction that cannot succeed, with an opaque settle failure rather than a clear pre-flight rejection.
- **Overpay / refund-dependence (placeholder path):** because `amountInRaw ?? 0n` is read from a default-of-1 source, the attached value can also be a fixed quantity unrelated to the quote, leaving the user reliant on unguaranteed router refund behavior for any excess.

Compounding the first issue: the worst-case input the router is authorized to pull (`amountInMaximum`) is **never surfaced** on the returned `SwapQuote`. For an exact-output swap the only protective bound that matters is the **maximum input**, yet the quote reports a slippage-adjusted `amountOutMin` on a fixed output (meaningless) and exposes no max-input field. A frontend or agent has no machine-readable view of how much native value can actually be debited, so it cannot set or sanity-check the value itself.

## Findings

- **F004** — `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:172`: native-in exact-output sets `value: isNativeAsset(assetIn) ? (amountInRaw ?? 0n) : 0n`, where `amountInRaw` is the `resolveQuoteDefaults` placeholder (`params.amountIn ?? 1`, `SwapProvider.ts:275`), not the encoded `amountInMaximum`; `SETTLE_ALL` underfunds and reverts.
- **F048** — `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:270-294`: the exact-out branch computes `maxAmountIn` (271-273) and bakes it into both the swap params (`amountInMaximum`, 284) and `SETTLE_ALL` (288), but `encodeUniswapSwap` returns only calldata (302-310); the enforced spend ceiling is never exposed on `SwapQuote`, so consumers cannot see (or fund against) the real worst-case input.

## Root cause

Two coupled gaps with a shared origin in `resolveQuoteDefaults`:

1. **Shared placeholder root.** `resolveQuoteDefaults` computes `amountInRaw = parseAssetAmount(params.assetIn, params.amountIn ?? 1)` (`SwapProvider.ts:275`). On the exact-output path `params.amountIn` is undefined, so this fabricates a 1-unit value. `UniswapSwapProvider._getQuote` already knows the correct slipped input: line 147 derives `finalAmountInRaw = amountOutRaw ? quote.amountInRaw : amountInRaw` and reports it as the quote's `amountInRaw`. But line 172 still reads the raw placeholder `amountInRaw` for `execution.value` rather than the slipped `quote.amountInRaw` (and rather than the slippage-buffered `maxAmountIn` the encoder enforces).

2. **`amountInMaximum` is encoder-local.** The encoder computes `maxAmountIn = quote.amountInRaw + quote.amountInRaw * round(slippage*1e4) / 1e4` (`encoding.ts:271-273`) but does not return it, and the provider never recomputes it for `value` or for the quote surface. So the value that the calldata actually authorizes lives in exactly one place the caller never sees.

**Consistency note.** Velodrome's `value: isNativeAsset(assetIn) ? amountInRaw : 0n` (`VelodromeSwapProvider.ts:194`) reads the same shared `resolveQuoteDefaults.amountInRaw`, but Velodrome rejects exact-output entirely (`VelodromeSwapProvider.ts:76,141` throw when `amountOut`/`amountOutRaw` is provided). Its exact-input path always has a real user-supplied `amountIn`, so the `?? 1` placeholder never reaches it. The bug is therefore Uniswap-specific *by construction*, but the unsafe value is the shared `?? 1` default — fixing it at the provider (and ideally guarding the shared default) keeps the two providers' native-value handling consistent.

## Recommended approach

SDK fix (in scope: missing-obvious-validation / fail-closed where the SDK already knows the right number / sibling consistency).

1. **Set `execution.value` to the encoded max-in for native exact-output.** For the native-input exact-output path, attach the slippage-buffered `maxAmountIn` that the calldata's `amountInMaximum` / `SETTLE_ALL` already enforce — not the placeholder. The cleanest source is to derive `maxAmountIn` once and use it for both encoding and `value`, rather than recomputing in two places (this also aligns with the F005 "compute the bound once, reuse it" direction without depending on it). For exact-input, `value` continues to use the real `quote.amountInRaw`.

2. **Surface `amountInMax` / `amountInMaxRaw` on `SwapQuote`.** Add the max-input field to the quote type (`packages/sdk/src/types/swap/base.ts`, alongside `amountOutMinRaw`) and populate it from the same `maxAmountIn`. This is the F048 surfacing piece: it gives consumers the protective bound that actually governs an exact-output trade and lets them sanity-check `execution.value`. For exact-output, prefer omitting (or not relying on) the meaningless `amountOutMin` on a fixed output.

3. **Guard the shared default (consistency / fail-closed).** Optionally tighten `resolveQuoteDefaults` so the `?? 1` placeholder cannot silently flow into `value` for any provider: the placeholder exists only to satisfy quote math on the exact-output path, so it should never be the source of an attached native value. At minimum, the provider must not read the pre-quote placeholder `amountInRaw` for `value`.

No intent-guessing, no broad refuse-to-sign, no RPC-trust changes: this is the SDK attaching the value its own encoded calldata already requires, and exposing the bound it already computed.

## Affected files

- `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:147,172` — `execution.value` must use the encoded max-in, not the placeholder `amountInRaw`.
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:270-277` — `resolveQuoteDefaults` `?? 1` placeholder (shared root); ensure it cannot feed native `value`.
- `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:270-294` — `maxAmountIn` computed here; return it (or have the provider derive the identical value) so it can drive both `value` and the surfaced quote field.
- `packages/sdk/src/types/swap/base.ts:208-219` — add `amountInMax` / `amountInMaxRaw` to `SwapQuote`.
- `packages/sdk/src/actions/swap/providers/velodrome/VelodromeSwapProvider.ts:194` — consistency reference (safe today only because Velodrome rejects exact-output); verify no regression.

## Acceptance criteria / tests

- A native-in exact-output Uniswap quote returns `execution.value === amountInMaximum` (the slippage-buffered max-in encoded into `SETTLE_ALL`), **not** a 1-unit placeholder. Decode the calldata's `amountInMaximum` and assert it equals `execution.value`.
- `SwapQuote` exposes `amountInMax` / `amountInMaxRaw` for exact-output, equal to the `maxAmountIn` baked into calldata; a test decodes the calldata and asserts equality (closes the F182 "amountInMaximum never decoded/asserted" gap referenced for exact-out tests).
- ERC-20 exact-output (non-native) still sets `execution.value === 0n`.
- Exact-input (native and ERC-20) is unchanged: native `value === quote.amountInRaw`, ERC-20 `value === 0n`.
- A regression test asserts the `resolveQuoteDefaults` `?? 1` placeholder never appears as `execution.value` for any native-input quote.

## Notes

- `amountInMaximum` is part of the signing-path payload (it bounds how much native/ERC-20 the router may pull), so getting it right and visible is squarely in scope.
- Related but separate tickets in this cluster: F005 / refines:F005 (compute the slippage bound once and reuse the identical raw value in display and calldata) and F257 (exact-output Permit2/ERC-20 approval keyed to un-slipped `amountInRaw` instead of `maxAmountIn`). This ticket should reuse a single derived `maxAmountIn` where practical so those fixes converge, but does not depend on them.
- No "audit" wording: this is a hardening / consistency fix surfaced during the production-readiness security review.
