# Velodrome native-ETH output unwrap and real priceImpact

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | swap |
| **Surface** | `velodrome/encoding/routers/cl.ts:135-164` and `routers/v2.ts:214-237` (no trailing `UNWRAP_WETH` on the universal/CL paths); `encoding/helpers.ts:74-75` (`Infinity`/`NaN` price strings) and `helpers.ts:80` (`priceImpact: 0`) |
| **Resolves findings** | F258, F049, F115 |
| **Candidate existing issue** | none |
| **Blocked by** | none |

## Problem

Three defects in the Velodrome/Aerodrome quote-and-encode path, all in the same `encoding/` directory, all instances of the SDK reporting something it does not actually deliver:

1. **Silent WETH-for-ETH substitution (F258, the fund-safety core).** When a caller requests a swap with `assetOut = native ETH` and the market routes through the **Universal Router** (`routerType: 'universal'`) or a **CL/Slipstream** pool, the encoded calldata trades to WETH and delivers it to `msg.sender` with no trailing `UNWRAP_WETH` command. The wallet receives **WETH**, not the native **ETH** the caller asked for, while the SDK's quote reports `amountOut` in ETH terms (WETH and ETH are both 18-decimal, so the numbers look identical and mask the substitution). This is asymmetric with the v2/leaf router path, which correctly branches on `isNativeAsset(assetOut)` and emits `swapExactTokensForETH` to unwrap. Funds are recoverable (WETH is 1:1 redeemable for ETH), so this is a correctness / loss-of-intent defect rather than an irrecoverable fund loss, but it is a **silent** asset substitution on the signing path and the output-side mirror of the native-IN gap (F047 / refines:F047).

2. **Price-impact safety field is always zero (F049).** Every Velodrome quote (v2, leaf, CL) returns `priceImpact: 0`. Any frontend or agent that gates execution on `priceImpact` (the standard sandwich / thin-pool safety check) sees a false "0% impact, safe" signal for **every** Velodrome swap, even when trading a large size into a shallow pool that settles far below mid-price. The sibling Uniswap provider populates a real `priceImpact`, so a consumer reasonably trusting this field is protected on one provider and silently unprotected on the other.

3. **Non-finite price strings in the quote (F115).** `buildSwapPrice` computes `price` and `priceInverse` as float divisions over human-readable amounts. For a zero or sub-wei-scale amount the division yields `Infinity` / `NaN`, and `.toFixed(6)` bakes the literal strings `'Infinity'` / `'NaN'` verbatim into the returned `SwapPrice`. These are display / metadata fields and do **not** feed the enforced raw-bigint min-out, so there is no direct signing-path fund loss, but a non-finite price string can mislead a UI or a downstream price comparator.

## Findings

- **F258** — `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/cl.ts:135-164` (`encodeCLSwap`) and `routers/v2.ts:214-237` (`encodeUniversalV2Swap`) emit a single `V3_SWAP_EXACT_IN` / `V2_SWAP_EXACT_IN` command with recipient = the `UNIVERSAL_ROUTER_MSG_SENDER` sentinel and **no** trailing `UNWRAP_WETH` command, with no branch on `isNativeAsset(assetOut)`. `helpers.ts:30-33` (`resolveTokens`) maps native ETH out to the WETH predeploy, so native-out delivers WETH on these two router types. The v2/leaf path (`routers/v2.ts:261-267`) does branch and emits `swapExactTokensForETH`, proving the intended convention.
- **F049** — `packages/sdk/src/actions/swap/providers/velodrome/encoding/helpers.ts:80`: `buildSwapPrice` hard-codes `priceImpact: 0`, and every Velodrome quote path returns through it (`routers/v2.ts:65` `getQuote`, `routers/cl.ts:95` `getCLQuote`), so `SwapQuote.priceImpact` is always `0` for this provider.
- **F115** — `packages/sdk/src/actions/swap/providers/velodrome/encoding/helpers.ts:74-75`: `price: (amountOut / amountIn).toFixed(6)` and `priceInverse: (amountIn / amountOut).toFixed(6)` over `parseFloat(formatUnits(...))` floats yield `'Infinity'` / `'NaN'` strings when a divisor is `0` or a tiny amount underflows.

## Root cause

A single underlying pattern: the Velodrome encoders and quote builder were written for the common ERC-20-to-ERC-20 case and never completed the native-output and edge-case branches that the v2/leaf path and the Uniswap sibling already handle.

- **F258**: `resolveTokens` (`helpers.ts:27-33`) converts native ETH to WETH for both in and out, because the routers require a real token address in the Route struct. On the v2/leaf path `encodeRouterSwap` (`routers/v2.ts:243-274`) compensates by branching on `isNativeAsset(assetIn)` / `isNativeAsset(assetOut)` to pick the wrap/unwrap-aware router function. The Universal-Router (`encodeUniversalV2Swap`) and CL (`encodeCLSwap`) encoders never added the matching output branch: they always direct the swap output to `msg.sender` as the resolved `tokenOut` (= WETH) with no `UNWRAP_WETH` step. So `assetOut = ETH` is accepted, quoted, and signed, but settles in WETH.
- **F049**: `buildSwapPrice` returns a constant `priceImpact: 0` because no impact computation was ever wired for Velodrome; it has the pool/reserve and CL `sqrtPrice` data available at quote time (v2 reserves via the pool/router quote, CL `sqrtPriceX96After` from the QuoterV2 result `quoteResult` in `cl.ts:89`) but does not use it.
- **F115**: the price strings are derived by naive float division with no guard for a zero or non-finite divisor before `.toFixed(6)`.

## Recommended approach

SDK fix. In scope under missing-obvious-validation, fail-closed-where-the-SDK-already-knows, and sibling consistency. No intent-guessing, no broad refuse-to-sign, no RPC-trust assumptions: each change is the SDK either delivering the asset its own quote names, or refusing to emit a value it knows is wrong/unknown.

**1. F258 — native-ETH output on universal/CL (primary).** Two options, in order of preference:

- **Preferred (deliver the requested asset):** when `isNativeAsset(assetOut)`, append an `UNWRAP_WETH` command after the swap on both the universal (`encodeUniversalV2Swap`) and CL (`encodeCLSwap`) encoders. The swap's recipient becomes the Universal Router itself (so it holds the WETH), then `UNWRAP_WETH` unwraps and sends native ETH to the `msg.sender` sentinel with `amountMin = amountOutMin`. This matches the v2/leaf `swapExactTokensForETH` behavior and makes all four router paths consistent. Requires adding the `UNWRAP_WETH` command byte and its input-param shape to the Velodrome encoders (no such constant exists in the provider today).
- **Minimum (fail closed until the unwrap leg lands):** if the unwrap command is not yet wired, **reject** native-ETH output on the `universal` and `cl` router types with an explicit named error rather than silently delivering WETH. The provider already has a precedent for fail-closed on an unsupported shape (`ExactOutputNotSupportedError`); a parallel `NativeOutputNotSupportedError` (or reuse of an existing market/param error) keeps the contract honest. The v2/leaf path stays as-is (it already unwraps).

Either way, add a guard at the encode entry so `assetOut = ETH` can never be encoded as a WETH delivery without the caller's knowledge.

**2. F049 — real price impact.** Compute a real `priceImpact` for Velodrome instead of the literal `0`:

- v2 / leaf: reserves-based mid-price vs. executed price (the pool / router quote already exposes reserves).
- CL / Slipstream: derive from the QuoterV2 `sqrtPriceX96After` returned in `getCLQuote` (`cl.ts:89`), mirroring the Uniswap path's `calculatePriceImpact` (`uniswap/encoding.ts:380`) so the two providers compute the field the same way.

If a real value is genuinely infeasible for a given path, return `undefined` (mark the field optional) rather than `0`, so a consumer can distinguish "no impact" from "unknown" and fail closed on its own gate. Do **not** leave a literal `0` that reads as "safe".

**3. F115 — non-finite price strings.** Guard the divisions in `buildSwapPrice`: when `amountIn` or `amountOut` is `0` or non-finite, emit `'0'` (or an explicit sentinel) instead of `'Infinity'` / `'NaN'`. This is display-only cleanup with no signing impact, folded in here because it is the same function and the same one-line edit surface.

## Affected files

- `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/cl.ts:135-164` — `encodeCLSwap`: add native-out `UNWRAP_WETH` leg (or fail-closed guard); add the `UNWRAP_WETH` command byte / input shape.
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:214-237` — `encodeUniversalV2Swap`: same native-out unwrap / guard.
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:243-274` — `encodeRouterSwap`: reference path that already unwraps correctly (consistency target; verify no regression).
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/helpers.ts:30-33` — `resolveTokens`: native-out → WETH mapping that the encoders must compensate for.
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/helpers.ts:74-75` — `buildSwapPrice` price / priceInverse divisions (F115 guard).
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/helpers.ts:80` — `buildSwapPrice` `priceImpact: 0` (F049).
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/cl.ts:89-95` — CL quote result (`sqrtPriceX96After`) available for a real CL price impact.
- `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:380` — `calculatePriceImpact` sibling to mirror for consistency.
- `packages/sdk/src/types/swap/index.ts` — `SwapPrice.priceImpact` type; make optional if "unknown" is to be representable.
- `packages/sdk/src/core/error/errors.ts:202-217` — `ExactOutputNotSupportedError` precedent for a fail-closed native-output error.

## Acceptance criteria / tests

- **F258 unwrap (preferred path):** encode a native-ETH-output swap on a `universal` router market and on a `cl` pool market; decode the calldata and assert the command list ends with `UNWRAP_WETH` with recipient = the `msg.sender` sentinel and `amountMin = amountOutMin`. Assert the swap-leg recipient is the router (so it holds WETH to unwrap), not `msg.sender`.
- **F258 fail-closed (minimum path, if unwrap not yet wired):** encoding a native-ETH-output swap on `universal` / `cl` throws a named error; the v2/leaf path still encodes `swapExactTokensForETH` and is unchanged.
- **F258 regression guard:** an ERC-20-to-ERC-20 universal/CL swap encodes with **no** `UNWRAP_WETH` and recipient = `msg.sender` (i.e., the unwrap leg appears only for native output).
- **F049:** a large swap into a thin pool returns `priceImpact > 0` (not `0`); a near-mid-price swap returns a small impact; assert the CL value is computed from `sqrtPriceX96After` consistently with the Uniswap `calculatePriceImpact` helper. If "unknown" is chosen for any path, assert it returns `undefined`, never `0`.
- **F115:** `buildSwapPrice` with `amountOutRaw = 0n`, and with a 1-wei-of-18-decimal amount, returns finite `price` / `priceInverse` strings (no `'Infinity'` / `'NaN'`); existing normal-amount cases are unchanged.

## Notes

- F258 is the fund-safety / loss-of-intent core (the SDK signs calldata delivering a different asset than the quote names); F049 and F115 are bundled because they live in the same `encoding/` files and the same quote-builder, and all three are "the quote claims X, the SDK delivers / reports not-X" within this one provider.
- The `UNWRAP_WETH` payload is part of the signed Universal Router calldata, so getting it right (or refusing to sign without it) is squarely on the signing path and in scope.
- Output-side companion to the native-IN findings (F047 / refines:F047, native-in `msg.value`); this ticket is native-OUT only and does not depend on those.
- No "audit" wording: this is a hardening / consistency fix surfaced during the production-readiness security review.
