# Key exact-output approval to maxAmountIn and route by input cost

| | |
|---|---|
| **Severity** | medium |
| **Complexity** | 4 / 5 |
| **Domain** | swap |
| **Surface** | UniswapSwapProvider exact-out approval/SETTLE_ALL, BaseSwapNamespace best-quote comparator |
| **Resolves findings** | F257, F114, F263, F182, F184, F120 |
| **Candidate existing issue** | #435 |
| **Blocked by** | (none) |

## Problem

Two independent defects in the swap path make exact-output swaps and multi-provider routing
behave incorrectly, both with direct fund-safety consequences.

1. **Exact-output input approval is keyed to the wrong amount.** For an exact-output Uniswap
   swap the ERC20-to-Permit2 and inner Permit2-to-UniversalRouter allowances are set to the
   un-slipped quoted input (`quote.amountInRaw`), but the encoded V4 `SWAP_EXACT_OUT_SINGLE` +
   `SETTLE_ALL` action authorizes the router to pull up to `maxAmountIn` (the quoted input plus
   slippage). The instant the true required input rises above the un-slipped figure - exactly the
   adverse-price band the slippage tolerance exists to absorb - the allowance is short and the
   `transferFrom` inside settle reverts. Input-side slippage protection is therefore structurally
   unusable in the default `exact` approval mode: a swap that should succeed within tolerance
   instead reverts on-chain, wasting gas and producing an opaque failure.

2. **Best-quote routing optimizes the wrong objective and ignores gas.** The cross-provider
   comparator (and the public `getQuotes` sort) always maximize gross `amountOutRaw`. For
   exact-output swaps every provider returns the same target output, so the correct objective is
   to **minimize input cost** (`amountInRaw`); the direction-blind comparator silently picks the
   costlier-input quote and the user over-spends. Separately, the comparator never reads
   `quote.gasEstimate` even though both providers populate it, so for small or hop-count-divergent
   routes the "best" route can be net-worse after gas. In both cases the picked quote's calldata is
   pre-built and handed straight to `execute()`, so the user signs the net-worse route.

The exact-output approval (defect 1) is the higher-impact item: in default mode it makes any
in-tolerance adverse move revert, defeating slippage protection on the input leg.

## Findings

- **F257** (`UniswapSwapProvider.ts:101`, `encoding.ts:271-273,288`) - exact-output approval keyed
  to `quote.amountInRaw` (un-slipped) while `SETTLE_ALL` authorizes `maxAmountIn`; allowance is
  insufficient on any adverse move within the slippage band and settle's `transferFrom` reverts.
- **F114** (`BaseSwapNamespace.ts:104-110,220-242`) - best-quote routing always maximizes
  `amountOutRaw`, the wrong objective for exact-output (should minimize `amountInRaw` cost); the
  direction-blind comparator silently picks the costlier quote.
- **F263** (`BaseSwapNamespace.ts:220-242`) - `getBestQuote` (225-230) and the `getQuotes` sort
  (104-110) never read `quote.gasEstimate`, which both providers populate; the gross-output "best"
  route can be net-worse after gas, contradicting documented `routing:'price'`. Distinct from
  F114: gas-not-factored on every direction.
- **F182** (`providers/uniswap/__tests__/sdk.test.ts:274-310,367-397`) - exact-output
  `amountInMaximum` (the spend ceiling) is never decoded or asserted; exact-out tests check only
  the `0x` prefix and `exactIn != exactOut`, so a broken `maxAmountIn` passes.
- **F184** (`namespaces/__tests__/BaseSwapNamespace.spec.ts:58-232`) - best-quote routing is tested
  only for exact-IN (maximize `amountOut`); no test covers the F114 exact-OUT mis-objective where
  the comparator should minimize `amountIn` cost.
- **F120** (`types/swap/base.ts:79-103,154-173`) - exact-output is a per-provider capability with no
  discriminated-union/type-level surfacing; the price-routing path silently drops Velodrome's
  `ExactOutputNotSupportedError` via `Promise.allSettled` (low; scope-limited, see Notes).

## Root cause

Two unrelated assumptions baked into the swap path:

1. The Uniswap approval builder assumes the input spend equals the quoted input. It passes
   `quote.amountInRaw` as the approval `requiredAmount` (`UniswapSwapProvider.ts:101`), but for
   exact-output the encoder deliberately raises the authorized pull to
   `maxAmountIn = amountInRaw + amountInRaw * slippage` (`encoding.ts:271-273`) and bakes that into
   the `SETTLE_ALL` currency amount (`encoding.ts:288`). The approval and the encoded ceiling are
   computed from the same base but only one applies slippage, so they diverge by exactly the
   tolerance band.

2. The routing comparator assumes "more output is always better." It hard-codes an
   `amountOutRaw`-descending comparison in both `getBestQuote` and the `getQuotes` sort, with no
   awareness of swap direction (exact-in vs exact-out) and no read of the per-quote `gasEstimate`
   that the type already documents (`base.ts:248-249,310`) and both providers attach
   (`UniswapSwapProvider.ts:184`, `VelodromeSwapProvider.ts:202`).

## Recommended approach

SDK changes (in scope - refactor permitted):

1. **Key the exact-output approval to `maxAmountIn`.** Compute the slipped input ceiling once and
   use it as the approval `requiredAmount` for exact-output swaps so the ERC20/Permit2 allowance
   matches the `SETTLE_ALL` authorization. The simplest non-duplicating fix is to surface the
   already-computed `maxAmountIn` from the encoder onto the quote (e.g. an `amountInMaxRaw` /
   spend-ceiling field) and have `_buildApprovals` pass that instead of `quote.amountInRaw` for the
   exact-output leg (`UniswapSwapProvider.ts:94,101`). Exact-input is unaffected (no `maxAmountIn`).
   Avoid recomputing the slippage math in two places - read one source of truth.

2. **Make the comparator direction- and gas-aware.** Replace the gross-`amountOutRaw` comparison in
   `getBestQuote` (`BaseSwapNamespace.ts:225-230`) and the `getQuotes` sort
   (`BaseSwapNamespace.ts:104-110`) with an objective that:
   - for **exact-output** minimizes input cost (`amountInRaw`), and
   - factors `gasEstimate` into the net comparison on both directions when it is present, falling
     back to the current gross comparison when a quote omits it (`gasEstimate` is optional).
   Keep both call sites consistent (extract a single comparator helper) and update the `getQuotes`
   JSDoc, which currently promises "sorted by amountOut descending (best first)"
   (`BaseSwapNamespace.ts:86`), to describe the real, direction-aware ordering.

3. **F120 (low) - keep scope tight.** Do not build a full discriminated-union exact-output
   capability type in this ticket. The actionable, in-scope slice is the silent-drop: when the
   routing path filters quotes via `Promise.allSettled`, a provider that legitimately cannot serve
   exact-output (`ExactOutputNotSupportedError`) is indistinguishable from a real failure. At
   minimum, ensure that when **all** providers reject an exact-output request the surfaced error
   reflects "exact-output unsupported by eligible providers" rather than a generic
   all-failed-to-quote message. Defer the type-level capability surfacing to its own backlog item
   (tracked under #440).

Tests (F182, F184) are part of this ticket - see Acceptance criteria.

No demo/CLI changes are required by this ticket. Any CLI exact-output exposure is review-only:
confirm no CLI-side defaults silently mask the corrected behavior, no architectural refactor.

## Affected files

- `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:81-104` - `_buildApprovals`
  passes `quote.amountInRaw` (101) as the approval amount; needs the exact-output spend ceiling.
- `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:271-273,288` - `maxAmountIn` computed
  with slippage and encoded into `SETTLE_ALL`; source of truth for the authorized input ceiling.
- `packages/sdk/src/actions/swap/namespaces/BaseSwapNamespace.ts:104-110` - `getQuotes` gross-output
  sort (and JSDoc at 86).
- `packages/sdk/src/actions/swap/namespaces/BaseSwapNamespace.ts:220-242` - `getBestQuote`
  gross-output comparator (225-230).
- `packages/sdk/src/types/swap/base.ts:248-249,310` - `gasEstimate` field the comparator must read;
  candidate location for an exact-output input-ceiling field if surfaced onto the quote.
- `packages/sdk/src/actions/swap/providers/uniswap/__tests__/sdk.test.ts:274-310,367-397` - exact-out
  tests that never decode/assert `amountInMaximum` (F182).
- `packages/sdk/src/actions/swap/namespaces/__tests__/BaseSwapNamespace.spec.ts:58-232` - routing
  tests that cover only exact-IN (F184).

## Acceptance criteria / tests

- **Approval matches the spend ceiling (F257).** A unit/integration test for an exact-output
  Uniswap swap asserts the ERC20-to-Permit2 and inner Permit2-to-router approval amounts equal the
  encoded `SETTLE_ALL` `maxAmountIn` (slipped), not `quote.amountInRaw`. A regression that reverts
  the approval to the un-slipped value must fail this test.
- **`amountInMaximum` is decoded and asserted (F182).** Extend the exact-out encoder tests to decode
  the `EXACT_OUTPUT_SINGLE_PARAMS` / `SETTLE_ALL` currency amount and assert `amountInMaximum` /
  `maxAmountIn` equals `amountInRaw + amountInRaw * slippage`, replacing the current
  `0x`-prefix-only check.
- **Exact-output routing minimizes input cost (F114, F184).** A multi-provider test where two
  providers return the same fixed `amountOut` but different `amountIn` asserts the **lower-input**
  quote is selected by `getBestQuote` and sorted first by `getQuotes`. This is F114 turned into a
  failing-then-passing test.
- **Routing factors gas (F263).** A test where the higher-gross-output quote has materially higher
  `gasEstimate` such that it is net-worse asserts the net-better quote is selected; a quote missing
  `gasEstimate` falls back to the existing gross comparison without throwing.
- **JSDoc truthfulness.** `getQuotes` documentation describes the direction-aware ordering rather
  than the (now incorrect) "amountOut descending" claim.
- **No exact-input regression.** Existing exact-input approval and routing tests continue to pass
  unchanged.
- Full `pnpm` typecheck / lint / test / build pass.

## Notes

- F257 is the load-bearing item: in the default `exact` approval mode the mismatch makes any
  in-tolerance adverse move revert, so input-side slippage protection is effectively dead until the
  approval is keyed to `maxAmountIn`. Velodrome is unaffected (it throws
  `ExactOutputNotSupportedError` and never reaches this encoder).
- F114 and F263 are distinct objectives on the same comparator: F114 is the exact-output
  wrong-direction objective; F263 is gas-not-factored on every direction. Both are fixed by the
  single direction-and-gas-aware comparator but should be verified by separate tests.
- F120 is low and only partially in scope here; the type-level discriminated-union surfacing is a
  separate concern (#440). This ticket only removes the silent-drop of `ExactOutputNotSupportedError`
  in the all-providers-failed case.
- Candidate existing issue **#435** covers the price-routing comparator area (F114/F263/getQuotes
  contract); this ticket adds the exact-output approval leg (F257) and the supporting test gaps
  (F182/F184). This is **not** an augment-only request - it is a standalone ticket that overlaps
  #435 on the routing surface.
- This is **not** a refuse-to-sign or intent-guessing change. Both fixes use values the SDK already
  computes (the encoder's `maxAmountIn`, the providers' `gasEstimate`) - missing-obvious-validation
  and fail-closed-where-the-SDK-already-knows, consistent across the two sibling providers.
