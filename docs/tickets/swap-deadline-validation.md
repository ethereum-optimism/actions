# Validate swap deadline finite/positive/future before baking into router calldata

> **AUGMENT existing issue #373** - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| | |
|---|---|
| **Severity** | medium |
| **Complexity** | 2 / 5 |
| **Domain** | swap |
| **Surface** | `SwapProvider.ts:272-273,462-464` (`BigInt(deadline)` baked into signed router calldata) |
| **Resolves findings** | F097 |
| **Candidate existing issue** | #373 |
| **Blocked by** | (none) |

## Problem

The caller-supplied swap `deadline` is an optional `number` that flows untouched from quote/execute
params into the encoded router calldata that the user signs. It is never validated for finiteness,
positivity, or futureness before `BigInt(deadline)` consumes it inside every encoder. Two concrete
fund-safety / UX hazards follow:

1. **Non-integer deadline (float) throws an opaque `RangeError` deep in encoding.** A caller who
   passes a millisecond timestamp where seconds are expected (`Date.now()` instead of
   `Math.floor(Date.now()/1000)`), or any fractional value, hits `BigInt(1.5)` inside the encoder
   and gets a library-internal `RangeError` rather than a clear named SDK validation error at the
   boundary. The failure surfaces far from the input that caused it.

2. **Zero / past deadline is encoded verbatim into a signed, guaranteed-revert swap.** A `deadline`
   of `0` or any past unix second is baked straight into the swap calldata with no sanity check on
   the raw-params `execute()` path and on every `getQuote()` return. The user signs a transaction
   the router will revert on `deadline` check, wasting gas. Symmetrically, a far-future deadline the
   caller did not intend keeps the swap executable long after the user expected it to lapse.

The SDK already knows the current time (it computes `now = Math.floor(Date.now()/1000)` two lines
above the defaulting at `SwapProvider.ts:272`) and it already ships sibling validators that encode
exactly this discipline (`validateQuoteNotExpired`, `validateSlippage`). This is
missing-obvious-validation and fail-closed-where-the-SDK-already-knows, not intent-guessing: the SDK
has the now-timestamp in hand and simply never compares the caller's deadline against it.

The pre-built-quote execute path is partially protected: each provider sets the quote's `expiresAt`
equal to the same `deadline` (`UniswapSwapProvider.ts:183`, `VelodromeSwapProvider.ts:201`), and
`execute()` calls `validateQuoteNotExpired(quote.expiresAt)` (`SwapProvider.ts:435`), so a past
deadline is caught *there*. But that guard does not run on the raw-params `execute()` path, on
`getQuote()`, and cannot catch a non-integer (float) value at all - `validateQuoteNotExpired` only
checks `now >= expiresAt`, so `1.5` slips through to `BigInt(1.5)`.

## Findings

- **F097** (`SwapProvider.ts:272-273,462-464`) - caller `deadline` is defaulted but never validated
  finite/positive/future before it reaches `BigInt(deadline)` in the encoders
  (`uniswap/encoding.ts:308`; `velodrome/encoding/routers/cl.ts:162`,
  `velodrome/encoding/routers/v2.ts:257,265,272`); a float throws an opaque `RangeError`, a
  `0`/past value bakes a guaranteed-revert deadline into signed calldata, and a far-future value
  keeps a swap executable past the user's intended window. No `validateDeadline` exists in the SDK
  (grep-confirmed).

## Root cause

`deadline` is defaulted in two places and validated in none:

- `resolveQuoteDefaults` (`SwapProvider.ts:271-276`) computes `now` (line 272) and then
  `deadline = params.deadline ?? now + this.quoteExpirationSeconds` (line 273). The caller-supplied
  branch is never bounds-checked against `now`.
- `resolveParams` (`SwapProvider.ts:462-464`) repeats the identical `params.deadline ?? ...`
  defaulting with no validation.
- `validateSwapExecute` (`SwapProvider.ts:440-451`) validates assets, amounts, slippage, and
  recipient but has no deadline check, and `getQuote` (`SwapProvider.ts:164-167`) skips
  `validateSwapExecute` entirely (it only calls `assertChainSupported`), so the quote boundary
  applies no deadline sanity bound at all.

The encoders trust the resolved value and call `BigInt(deadline)` directly, so any unsanitised
float/zero/past value reaches the signing path.

## Recommended approach

SDK change (in scope - small, mirrors existing validators):

1. **Add a shared `validateDeadline(deadline: number)` to `utils/validation.ts`**, alongside
   `validateQuoteNotExpired`/`validateSlippage`. Assert the value is a positive integer strictly in
   the future, allowing a small clock-skew tolerance so a legitimately-just-expiring deadline is not
   spuriously rejected:
   - reject when `!Number.isInteger(deadline)` (kills the `BigInt(1.5)` `RangeError` at the boundary
     with a named error),
   - reject when `deadline <= now` (kills the `0`/past guaranteed-revert signed swap), using the same
     `now = Math.floor(Date.now()/1000)` basis as `validateQuoteNotExpired`.
   Throw a named SDK error (a dedicated `InvalidDeadlineError`, or reuse the existing
   `InvalidParamsError` shape) rather than letting viem/`BigInt` throw.

2. **Call it on both the execute and quote boundaries**, so coverage is symmetric across the
   raw-params and pre-built-quote paths and across the two sibling providers:
   - inside `validateSwapExecute` (`SwapProvider.ts:440-451`) for the `execute()` paths, and
   - at the quote boundary - either in `getQuote` (`SwapProvider.ts:164-167`) before `_getQuote`, or
     in `resolveQuoteDefaults` right after `now` is computed - so a quote carrying a baked-in
     zero/past/float deadline can never be produced and returned to a caller who builds their own tx
     from `quote.execution.swapCalldata`.

   Validate the caller-supplied value (when present); the SDK-defaulted value is already
   `now + quoteExpirationSeconds` and is finite/positive/future by construction, but running the
   guard on the resolved value uniformly is also acceptable and keeps the call site simpler.

3. **Reconcile the encoded deadline with `expiresAt`.** The providers already set
   `expiresAt = deadline` (`UniswapSwapProvider.ts:183`, `VelodromeSwapProvider.ts:201`); once the
   deadline is validated future at the quote boundary, the existing `validateQuoteNotExpired`
   execute-time guard and the encoded on-chain deadline stay consistent, closing the gap where a
   float deadline currently bypasses `validateQuoteNotExpired` (which only checks `now >= expiresAt`).

No demo/CLI changes are required. Any CLI-side deadline exposure is **review-only** (no
architectural refactor): confirm no CLI default passes a millisecond timestamp or a non-integer into
the SDK deadline parameter; if one does, that is a low-risk one-line fix, not a refactor.

## Affected files

- `packages/sdk/src/actions/swap/core/SwapProvider.ts:272-273` - `resolveQuoteDefaults` computes
  `now` then defaults `deadline` with no validation of the caller branch.
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:462-464` - `resolveParams` repeats the
  unvalidated `params.deadline ?? ...` defaulting.
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:440-451` - `validateSwapExecute` has no
  deadline check; natural call site for `validateDeadline` on the execute path.
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:164-167` - `getQuote` skips
  `validateSwapExecute`; quote-boundary call site for the new guard.
- `packages/sdk/src/utils/validation.ts:87-92,111-115` - `validateQuoteNotExpired` and
  `validateSlippage`; the sibling pattern and home for the new `validateDeadline`.
- `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:308` - `BigInt(deadline)` consumer.
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/cl.ts:162` - `BigInt(deadline)`
  consumer.
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:257,265,272` -
  `BigInt(deadline)` consumers.
- `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:183` /
  `packages/sdk/src/actions/swap/providers/velodrome/VelodromeSwapProvider.ts:201` - `expiresAt`
  set equal to `deadline` (reconciliation target).

## Acceptance criteria / tests

- **Float deadline is rejected at the boundary (F097).** A unit test calling `getQuote` and
  `execute` with `deadline: 1.5` asserts a named SDK error (`InvalidDeadlineError` / the chosen
  named error) is thrown, NOT a viem/`BigInt` `RangeError`. A regression that removes the
  `Number.isInteger` check fails this test.
- **Zero / past deadline is rejected on every signing path (F097).** Tests covering the raw-params
  `execute()` path and the `getQuote()` return assert that `deadline: 0` and a past unix second
  throw before any calldata is encoded - no `SwapQuote` with a baked-in past deadline is returned.
- **Quote-boundary parity.** A `getQuote` test confirms the deadline guard runs at the quote
  boundary (previously only `assertChainSupported` ran), so a quote with a zero/past/float deadline
  cannot be produced for a caller who self-builds from `quote.execution.swapCalldata`.
- **Sibling-provider symmetry.** The same float/zero/past rejection holds across both Uniswap and
  Velodrome encoders (the `BigInt(deadline)` sites at `encoding.ts:308`,
  `cl.ts:162`, `v2.ts:257,265,272`).
- **Valid deadlines still pass.** A future integer deadline, and the SDK-defaulted
  `now + quoteExpirationSeconds`, continue to quote and execute unchanged; small clock-skew within
  tolerance is not spuriously rejected.
- Full `pnpm` typecheck / lint / test / build pass.

## Notes

- This is **not** a refuse-to-sign or intent-guessing change. The SDK already computes `now` two
  lines above the defaulting (`SwapProvider.ts:272`) and already ships the sibling discipline in
  `validateQuoteNotExpired`/`validateSlippage`; the fix only adds the missing obvious bound at the
  boundary the SDK already controls.
- RPC trust is out of scope; this finding is purely about an SDK-controlled caller parameter reaching
  `BigInt()` and signed calldata, independent of any RPC.
- Candidate existing issue **#373** already covers the deadline/slippage validation surface (it is
  also the candidate for `refines:F110`, the `validateSlippage` ceiling gap); this finding adds the
  deadline-specific finite/positive/future bound and the quote-boundary parity. **Augment #373 with
  this color** rather than opening a new ticket, and flag it as important to land during
  implementation of that issue.
- Keep the guard centralized in `utils/validation.ts` so both swap providers (and any future swap
  provider) inherit identical deadline discipline rather than each encoder re-deriving it.
