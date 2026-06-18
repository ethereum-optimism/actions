# Harden amount parsing/formatting precision and add *Raw bigint escape hatches

> **AUGMENT existing issue #379 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | core |
| **Surface** | `utils/assets.ts` `parseDecimalAmount`/`parseAssetAmount`/`formatAssetAmount`; lend + swap public amount type contracts; Uniswap `_execute` raw round-trip |
| **Resolves findings** | F041, F151, F256, F246 |
| **Candidate existing issue** | #379 |
| **Blocked by** | (none) |

## Problem

Every value-moving action scales a human amount into a signed `bigint` through one shared converter, and converts the result back for display through one shared inverse. Both ends are lossy, and on two of the three sibling actions there is no way for a caller to bypass the lossy path with an exact `bigint`.

`parseDecimalAmount(amount: number, decimals)` does `parseUnits(amount.toString(), decimals)`. A JS `number` whose required integer (`amount * 10**decimals`) exceeds `Number.MAX_SAFE_INTEGER` (~9e15) has *already* lost precision as an IEEE-754 double before `toString()` runs, so the resulting `bigint` silently differs from intent (a few low-order wei on 18-dec amounts; more on ray-scaled values). Worse, `(1e21).toString()` is `"1e+21"` and `(1e-7).toString()` is `"1e-7"` — scientific-notation strings that `parseUnits` rejects with `InvalidDecimalNumberError`, so a legitimate large or tiny amount throws an opaque error instead of converting. This is the canonical conversion entry point on lend open/close, swap exact-in/exact-out, borrow, and `sendTokens`.

The inverse `formatAssetAmount(amount: bigint, decimals)` builds the decimal string from the bigint then returns `parseFloat(result)`, collapsing the exact wei value back into a double — lossy above ~2^53 base units — and its `padStart(decimals, '0')` produces a malformed string for a negative `amount` (the signature permits any `bigint`). So `parse → format → parse` is not an identity, and `formatAssetAmount` has no direct test at all.

The fund-safety framing: the lossy precision lands on amounts the SDK is about to *sign*. Borrow already gives callers the precise escape hatch (`{ amountRaw: bigint }`), and swap's resolved/quote types already carry `amountInRaw`/`amountOutRaw`, but the public lend params and public swap params force every amount through `number`. A caller holding an exact on-chain balance as a `bigint` (the natural shape from a `balanceOf` read) cannot express it on the lend or swap public API without round-tripping it through a lossy `number` first — the type-level root of the precision corruption. Today's measured impact is bounded (sub-ppm IEEE-754 loss on legitimate values, no sign flip, no attacker amplification, and the scientific-notation case throws rather than mis-signs), which is why this is medium and not high. But it is a real correctness/foot-gun cluster on the signing path, and the fix is to add the precise paths the SDK already has the shape for on its sibling actions.

## Findings

- **F041** — `packages/sdk/src/utils/assets.ts:17-19`: `parseDecimalAmount` feeds `number.toString()` to `parseUnits`, producing scientific notation for `>=1e21` / `<1e-6` (throws `InvalidDecimalNumberError`) and silently losing precision for high-magnitude numbers (IEEE-754 loss before `toString()`).
- **F151** — `packages/sdk/src/types/borrow/params.ts:12,20`: borrow exposes the precise `Amount = { amount: number } | { amountRaw: bigint }` union, but lend (`packages/sdk/src/types/lend/base.ts:248,312` — `amount: number`) and swap (`packages/sdk/src/types/swap/base.ts:80-83` — `amountIn?/amountOut?: number`) offer no `amountRaw` bigint escape hatch; the type-contract root of the F041 precision findings on the lend/swap paths.
- **F246** — `packages/sdk/src/utils/__tests__/assets.test.ts:33-54`: `parseAssetAmount`/`parseDecimalAmount` tests only use clean small values (100, 1, 0.5); the precision-loss and scientific-notation throw paths are untested and there is no `parse → format → parse` identity test anywhere.
- **F256** — `packages/sdk/src/utils/assets.ts:44-55`: `formatAssetAmount` (the human-readable inverse of `parseDecimalAmount`) has zero direct test coverage, so its `parseFloat` lossiness (`>2^53` base units) and negative-input `padStart` break ship green; companion to F246.

## Root cause

The amount converter and its inverse both pass through JS `number`/IEEE-754 at exactly the point where exactness matters, and two of the three sibling actions have no bigint bypass:

- `parseDecimalAmount` is `parseUnits(amount.toString(), decimals)` — a `number` input means precision is lost (or the string goes scientific) *before* `parseUnits` sees it. The only correct way to express a high-magnitude or sub-`1e-6` amount is to never let it become a `number`.
- `formatAssetAmount` constructs the right decimal string and then throws the exactness away with `parseFloat`, and assumes a non-negative `bigint` in its `padStart`.
- Borrow already solved the input side with the `Amount` discriminated union (`{ amountRaw: bigint }`), and swap's *resolved* path already carries `amountInRaw`/`amountOutRaw` — but the public lend and swap *params* are `number`-only, so a caller who has an exact bigint is forced back through the lossy converter. The SDK already knows the precise shape on a sibling action; it just is not offered consistently.
- A related raw-path detour exists in swap: `UniswapSwapProvider._execute` takes resolved `amountInRaw`/`amountOutRaw` bigints and round-trips them through `parseFloat(formatUnits(raw, decimals))` before re-feeding `_getQuote` (`packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:61-70`), re-introducing the same loss/throw on a path that already had the exact bigint.

## Recommended approach

All changes sit inside the missing-obvious-validation / fail-closed-where-the-SDK-already-knows / sibling-consistency scope. No intent-guessing, no refuse-to-sign, no RPC-trust hardening: a caller passing a representable `number` continues to convert exactly as today; the new paths only *add* precision and *add* a faithful inverse.

1. **Precise parse path (F041, SDK):** keep `parseDecimalAmount(amount: number, decimals)` for existing callers, but route the precise paths so a `bigint` never has to become a `number`. The primary fix is the type-contract escape hatch in step 2 (callers pass `amountRaw` and skip `parseDecimalAmount` entirely). For the residual `number` inputs that legitimately exceed safe-integer or go sub-`1e-6`, surface the failure as a named SDK error (an `InvalidAmountError`/`AmountPrecisionError`) instead of viem's opaque `InvalidDecimalNumberError`, rather than silently mis-converting — fail-closed where the SDK can detect the loss (e.g. reject when `amount` is non-integer-representable for the decimals, or guard the scientific-notation case before calling `parseUnits`).

2. **`amountRaw` escape hatch on lend + swap (F151, SDK):** adopt the borrow `Amount` discriminated union (or an `amountRaw?: bigint` companion) on the public lend (`LendOpenPositionParams`, `ClosePositionParams`) and swap (`WalletSwapParams.amountIn`/`amountOut`) params, so all three sibling actions share one precise amount contract. When `amountRaw` is supplied, plumb the bigint straight through to the internal `amountWei`/`amountInRaw`/`amountOutRaw` without touching `parseDecimalAmount`. This closes the hole at the API boundary and makes most of the F041 parse-site exposure unreachable for callers who opt in.

3. **Faithful `formatAssetAmount` inverse (F256, SDK):** make `formatAssetAmount` a precision-faithful inverse — either return the exact decimal string (as `formatUnits` does, which `_getPosition` already uses) or keep `number` output but document the precision boundary and guard `amount < 0n` so the `padStart` cannot produce a malformed string. The exact-inverse direction aligns with the #379 push to accept/return raw bigint amounts.

4. **Swap `_execute` raw plumbing (F041 sibling, SDK):** plumb `amountInRaw`/`amountOutRaw` straight through `UniswapSwapProvider._execute` to the quoter/encoder without the `parseFloat(formatUnits(...))` detour, so the raw-bigint execute path no longer drops wei or throws on tiny amounts. (Velodrome's sibling `_execute` should be checked for the same detour and fixed for consistency if present.)

5. **Tests (F246, F256, SDK):** see acceptance criteria — add the missing precision/scientific-notation parse tests, the `formatAssetAmount` direct + negative-input tests, and a `parse → format → parse` property/identity test.

No demo/CLI change is required by this ticket; this cluster is entirely SDK. (The backend request-boundary non-finite-amount gap that *relates* to this family, F290/F151, is tracked separately under the amount-positivity work and stays review-only there.)

## Affected files

- `packages/sdk/src/utils/assets.ts:17-19` — `parseDecimalAmount` `parseUnits(number.toString(), …)`: scientific-notation throw + silent IEEE-754 loss (F041)
- `packages/sdk/src/utils/assets.ts:30-36` — `parseAssetAmount` overload delegating to `parseDecimalAmount` (F041)
- `packages/sdk/src/utils/assets.ts:44-55` — `formatAssetAmount` `parseFloat` lossiness + negative-input `padStart` break (F256)
- `packages/sdk/src/types/borrow/params.ts:12,20` — borrow `Amount`/`AmountOrMax` union: the precise contract to adopt on the siblings (F151)
- `packages/sdk/src/types/lend/base.ts:248` — `LendOpenPositionParams.amount: number`, no bigint escape hatch (F151)
- `packages/sdk/src/types/lend/base.ts:312` — `ClosePositionParams.amount: number`, no bigint escape hatch (F151)
- `packages/sdk/src/types/swap/base.ts:80-83` — `WalletSwapParams.amountIn?/amountOut?: number`, no `amountRaw` on public params (F151)
- `packages/sdk/src/types/swap/base.ts:118-119` — `ResolvedSwapParams.amountInRaw?/amountOutRaw?: bigint` already carry the precise shape internally (F151 context)
- `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:61-70` — `_execute` round-trips raw bigints through `parseFloat(formatUnits(...))` before re-quoting (F041 sibling)
- `packages/sdk/src/utils/__tests__/assets.test.ts:33-54` — only clean small values tested; no precision/sci-notation/round-trip coverage (F246, F256)

## Acceptance criteria / tests

- **Scientific-notation parse (F041):** `parseDecimalAmount(1e21, 18)` and `parseDecimalAmount(1e-7, 18)` either convert exactly (if the precise path is wired) or throw a *named* SDK error, never a bare viem `InvalidDecimalNumberError`. Pin the chosen behavior with a test that documents F041; the test fails if the converter silently returns a wrong value.
- **High-magnitude precision (F041):** feeding a value whose `amount * 10**decimals` exceeds `Number.MAX_SAFE_INTEGER` through the `number` path either rejects with the named error or, where an `amountRaw` escape hatch is offered, the bigint path returns the exact base-unit value. A test asserts the exact bigint for the `amountRaw` path (e.g. `1_000_000_000_000_000_000_000_000n` survives unchanged), proving the lossy detour is bypassed.
- **`amountRaw` escape hatch (F151):** lend `openPosition`/`closePosition` and swap exact-in/exact-out accept an `amountRaw: bigint`, and the resulting internal `amountWei`/`amountInRaw`/`amountOutRaw` equals the input bigint exactly (no `parseDecimalAmount` round-trip). A test fails if the bigint is routed through the `number` converter. The pre-existing `number` path still produces the same wei it does today (regression guard).
- **`formatAssetAmount` direct coverage (F256):** add direct tests — `formatAssetAmount(10n**24n, 18)` does not silently lose digits relative to the documented contract, and `formatAssetAmount(-5n, 6)` does not produce a malformed/NaN result (either returns the correct negative value or the function rejects negatives by contract). A test fails if the `padStart` break regresses.
- **Round-trip identity (F246):** a property test (fast-check) asserting `parseDecimalAmount(formatAssetAmount(raw, d), d) === raw` (or the documented faithful inverse) for `raw` in `{1n, 100n, 10**18+7n, 1234567890123456789n, maxUint128}` × `d` in `{6, 8, 18}`. This is the test that encodes *why* the cluster matters: the converter and its inverse must agree on the exact wei the SDK signs.
- **Swap `_execute` raw plumbing (F041 sibling):** for `amountInRaw`/`amountOutRaw` in `{1n, 100n, 10**18+7n, 1234567890123456789n, maxUint128}` and decimals in `{6, 8, 18}`, the amount the encoder/quoter receives equals the input raw exactly (no wei dropped, no throw on tiny amounts). A test fails if the `parseFloat(formatUnits(...))` detour is reintroduced.

Each test encodes the intent (a signed amount must equal what the caller expressed to the wei; the inverse must round-trip), not merely that the function runs.

## Notes

- This augments **#379**, the raw-bigint amount contract issue. F041 is the parse-side precision/scientific-notation root, F151 is the type-contract half (give lend/swap the borrow `amountRaw` escape hatch), and F246/F256 are the missing precision + round-trip + `formatAssetAmount` tests. Landing F151's escape hatch is what makes most of F041 unreachable for opting-in callers, so do them together.
- Measured impact is bounded (P10 re-grade of the silent-loss variant: real IEEE-754 loss confirmed and the lend path is `number`-only, but loss is sub-ppm on low-order significant digits with no sign flip and no attacker amplification; the scientific-notation case throws rather than mis-signs). Hence medium, not high. The value of the fix is closing a signing-path foot-gun and bringing lend/swap to parity with borrow, not stopping an active exploit.
- Related but separate: the swap `_execute` raw round-trip (step 4) and the backend non-finite request-boundary check (F290/F151) live under their own loci; this ticket pulls the `_execute` detour in because it is the same `assets.ts`-shaped loss on a path that already holds the exact bigint, but the backend schema fix is review-only and tracked with the amount-positivity work.
- `sendTokens` (`DefaultSmartWallet.sendTokens`) shares the same `number → parseAssetAmount` exposure; its dedicated validation/coverage gap (F035/F036/F240) is tracked under the smart-wallet send tickets and is not re-filed here — but a fix to `parseDecimalAmount`/`formatAssetAmount` improves that path for free.
- No refactor of the public `parseDecimalAmount(amount: number, …)` signature is required; the escape hatch is additive, so existing integrators are unaffected.
