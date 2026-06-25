# Add decimal-precision/slippage/deadline sanity bounds to the CLI parse layer

> **AUGMENT existing issue #419** - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| | |
|---|---|
| **Severity** | medium |
| **Complexity** | 2 / 5 |
| **Domain** | cli |
| **Surface** | `utils/parseAmount`, `parseDecimal`, `parseSlippage`, swap `parseDeadline`; lend/borrow/swap envelopes |
| **Resolves findings** | F334, F335, F330, F336 |
| **Candidate existing issue** | #419 |
| **Blocked by** | (none) |

## Problem

The CLI parse layer is the entire validation boundary between loosely-typed commander argv and the
signed SDK params that move real principal. It guards the obvious extremes (positivity, integer
magnitude, positive-integer deadline) but leaves three boundary gaps where a malformed flag is
silently accepted and changes what gets signed on-chain, plus has zero test coverage:

1. **Amount precision is never checked against the asset's decimals (F334).** `parseAmount` guards
   `value <= 0` and integer-part magnitude but never the fractional-digit count against the resolved
   asset's `decimals` - even though every fund-moving verb resolves the asset at the *same* call site
   as the amount, so `decimals` is already in hand. Every amount also round-trips through
   `Number(raw)` in `parseDecimal`, so a >~15-16 significant-digit value is float-rounded before the
   SDK re-parses with `parseUnits(amount, asset.decimals)`. viem's `parseUnits` then *silently rounds*
   excess fractional digits rather than throwing: `--amount-in 0.0000001` on 6-decimal USDC becomes
   `0` raw, dispatching a near-zero (or reverting) swap with no CLI error. Worse, the lend and borrow
   envelopes echo the user's *typed* number, not the rounded on-chain amount, so an agent reading
   `--json` sees the requested value, not what actually moved. Only the swap envelope prints the SDK's
   real `amountIn`.

2. **`--slippage 0` is honored as a strict 0% band (F335).** A parsed `0` is `!== undefined`, so it is
   forwarded to the SDK and resolved literally via `params.slippage ?? defaultSlippage` (it is *not*
   coerced to the default), and `validateSlippage(0, max)` passes. The result is
   `amountOutMin == amountOut`: a zero protective band, so any block-to-block price drift reverts the
   swap on-chain (wasted gas, opaque exit) instead of failing cleanly at parse time. This is
   indistinguishable from a flag-omission typo, and the sibling `parseAmount` already rejects `<= 0`,
   so it is also an inter-sibling validation gap.

3. **`parseDeadline` allows past and millisecond values (F330).** It enforces only `/^[1-9]\d*$/`
   (positive integer) with no future/window/units check. A past timestamp (`--deadline 1`) bakes a
   guaranteed-revert deadline into the signed swap; a 13-digit millisecond value (a common
   `Date.now()` mistake, despite flag help saying "seconds") becomes a ~year-33000 deadline that fails
   *open*, silently neutering the deadline's staleness/MEV protection so the swap can sit pending and
   execute at a much-moved price.

4. **No tests cover this entire signed-param boundary (F336).** A regression that accepts a negative
   amount, mis-converts slippage, or drops the magnitude guard would silently change the signed value
   and nothing in the suite would fail.

The fund-safety framing: in every case the SDK already has the information to reject (the resolved
asset's `decimals`, the sibling positivity rule, the current time), and a wrong value either reaches
the signing path or makes the printed confirmation disagree with what moved on-chain.

## Findings

- **F334** (`packages/cli/src/utils/parseAmount.ts:20-28`, float round-trip at
  `packages/cli/src/utils/parseDecimal.ts:23`) - amount flags are not validated against the resolved
  asset's `decimals`; excess fractional precision is silently rounded by `Number(raw)` + viem
  `parseUnits`, and lend/borrow envelopes echo the typed amount, not the rounded on-chain amount.
- **F335** (`packages/cli/src/utils/parseSlippage.ts:9-15`) - `--slippage 0` parses to `0`, is
  forwarded (not coerced to default), and is honored as a strict 0% band, so a typo'd/omitted flag
  yields `amountOutMin == amountOut` and an on-chain revert on any drift.
- **F330** (`packages/cli/src/commands/actions/swap/util.ts:99-109`, forwarded at
  `util.ts:122`) - `parseDeadline` checks only positive-integer shape, so a past timestamp bakes a
  revert into signed calldata and a millisecond value silently neuters the deadline guard.
- **F336** (`packages/cli/src/utils/parseAmount.ts:1-28` and `parseDecimal`/`parseSlippage`/
  `parseDeadline`/`parseApprovalMode`) - zero unit tests cover the CLI parse layer that gates every
  fund-moving amount, slippage, and signed deadline; the only util test is `receipts.test.ts`.

## Root cause

The parse helpers each validate only their own narrow shape and stop short of the obvious
domain-specific bound that the call site already has the data to enforce:

- `parseAmount` (`parseAmount.ts:20-28`) is asset-agnostic by construction - it takes only `raw` and a
  `flag` label, never the `Asset`, so it cannot compare fractional digits to `asset.metadata.decimals`
  even though `buildSwapInputs` (`util.ts:148-151`), `runLendAction` (`runLendAction.ts:64-80`), and
  borrow `open.ts:21-25` all resolve the asset right next to the `parseAmount` call.
- `parseDecimal` collapses every value to `Number(raw)` (`parseDecimal.ts:23`) before any caller sees
  it, so precision beyond float is lost upstream of the SDK's `parseUnits`.
- `parseSlippage` (`parseSlippage.ts:9-15`) delegates to `parseDecimal` (which accepts `0`) and adds
  no floor, unlike its sibling `parseAmount.ts:22` which rejects `<= 0`.
- `parseDeadline` (`util.ts:99-109`) validates the regex shape but never compares against
  `Math.floor(Date.now()/1000)` or rejects millisecond magnitudes.
- The envelopes diverge: swap echoes the SDK's `result.amountIn` (`execute.ts:46`), but lend echoes
  the parsed typed `amount` (`runLendAction.ts:96-107`) and borrow echoes `envelopeAmounts`
  (`open.ts:40-43`, `runBorrowAction.ts:143`), so the printed amount is the typed value, not the
  rounded on-chain value.
- None of these helpers have tests, so the boundary's discipline is unenforced.

## Recommended approach

**Review-only (no architectural refactor).** This is a low-risk, fund-safety/UX hardening pass on the
CLI parse layer - arg-validation additions plus the missing tests, not a redesign of the parse layer
or the envelope projection. Keep the changes surgical:

1. **Decimal-precision bound (F334).** Reject an amount whose fractional-digit count exceeds the
   resolved asset's `decimals`, with a `CliError('validation')`, *before* dispatch. The cleanest place
   is at the call sites where the `Asset` is already resolved (`buildSwapInputs`, `runLendAction`,
   borrow handlers), since `parseAmount` itself is intentionally asset-agnostic - either pass
   `decimals` into a thin precision check or guard at the call site. Alternatively (or additionally),
   canonicalize via `formatUnits(parseUnits(raw, decimals), decimals)` and echo *that* canonical value
   in the lend/borrow envelopes so the printed amount matches what moved on-chain (closing the
   typed-vs-rounded echo gap that swap already avoids). Do not change the envelope's structural shape -
   only the value it carries.

2. **Slippage floor (F335).** In `parseSlippage`, treat a parsed `0` as a `validation` error (slippage
   must be `> 0`) for parity with `parseAmount`'s `<= 0` rejection - a one-line addition. If a strict
   0% band is ever intentionally desired, that decision belongs in docs, not silent acceptance; default
   to rejecting it as a likely typo.

3. **Deadline window (F330).** In `parseDeadline`, after the positive-integer check, require
   `value > Math.floor(Date.now()/1000)` (reject past), `value < now + MAX_DEADLINE_SECONDS` (reject
   absurd far-future), and reject obvious-millisecond magnitudes (`> ~1e12`), surfacing a clean
   `validation` error before any sign/broadcast. (A relative `--deadline-seconds <n>` offset would
   remove the units footgun entirely, but that is an API change - out of scope for this review-only
   pass; the bounds check is sufficient.)

4. **Tests (F336).** Add focused unit tests for the whole boundary (see below).

This is missing-obvious-validation and consistency-across-siblings, not intent-guessing or
refuse-to-sign: each bound uses data the CLI already holds (the resolved `decimals`, the sibling
positivity rule, the current time).

## Affected files

- `packages/cli/src/utils/parseAmount.ts:20-28` - `parseAmount` guards positivity and integer
  magnitude but not fractional precision vs asset decimals.
- `packages/cli/src/utils/parseDecimal.ts:23` - `Number(raw)` float round-trip loses precision before
  the SDK re-parses with `parseUnits`.
- `packages/cli/src/utils/parseSlippage.ts:9-15` - delegates to `parseDecimal` (accepts `0`), no floor.
- `packages/cli/src/commands/actions/swap/util.ts:99-109` - `parseDeadline` shape-only check;
  forwarded at `util.ts:122`.
- `packages/cli/src/commands/actions/swap/util.ts:148-153,160` - `buildSwapInputs` resolves the asset
  next to `parseAmount`/`parseSlippage` (decimal-bound and slippage-floor call site).
- `packages/cli/src/commands/wallet/lend/runLendAction.ts:64-80,96-107` - asset resolved next to
  `parseAmount`; envelope echoes the typed `amount`.
- `packages/cli/src/commands/wallet/borrow/open.ts:21-25,40-43` - asset/amount resolution and envelope
  amounts.
- `packages/cli/src/commands/wallet/borrow/runBorrowAction.ts:143` - borrow envelope echoes the typed
  `envelopeAmounts`.
- `packages/cli/src/commands/wallet/swap/execute.ts:46` - swap envelope echoes the SDK's actual
  `result.amountIn` (the correct pattern to mirror for lend/borrow).
- `packages/cli/src/utils/__tests__/receipts.test.ts` - only existing util test; the parse-layer tests
  land alongside it.

## Acceptance criteria / tests

- **Excess-precision amount is rejected (F334).** A test for each fund-moving verb asserts that an
  amount with more fractional digits than the asset's `decimals` (e.g. `0.0000001` on a 6-decimal
  asset, `1.0000000000000000001` on an 18-decimal asset) throws a `CliError('validation')` before
  dispatch, rather than being silently rounded to a different on-chain value.
- **Envelope echoes the on-chain amount (F334).** A test asserts the lend and borrow envelopes print
  the canonical (rounded-to-decimals) amount, matching what the SDK signs - so a `--json` consumer
  never sees a value different from what moved. Swap's existing `result.amountIn` echo is the
  reference behavior.
- **`--slippage 0` is rejected (F335).** A `parseSlippage('0')` test asserts a `CliError('validation')`
  (slippage must be `> 0`), encoding *why*: a 0% band is a likely typo that silently produces
  `amountOutMin == amountOut`. Valid slippage (e.g. `0.5` -> `0.005`) still passes.
- **Deadline window is enforced (F330).** Tests assert `parseDeadline` rejects a past timestamp
  (`--deadline 1`), a 13-digit millisecond value, and an absurd far-future value, while a plausible
  near-future second-scale timestamp still passes - each test naming the failure mode it prevents
  (on-chain revert vs neutered deadline guard).
- **Parse-layer coverage exists (F336).** New unit tests exercise `parseAmount` (zero, negative,
  `> MAX_SAFE_INTEGER`, scientific notation, hex, excess decimals), `parseSlippage` (0, negative,
  `> max`), `parseDeadline` (past, future, millisecond magnitude), and `parseDecimal` edge cases. Each
  test encodes the intent (a malformed value must never reach the signed SDK call), so a regression
  dropping any guard fails.
- Full `pnpm` typecheck / lint / test / build pass.

## Notes

- This is the **input-side analogue** of the `refines:F252` serializer type-lie at the CLI boundary:
  F252 is the SDK echoing a value the wire never carried; F334 is the CLI echoing a typed value the
  chain never moved. Same disagreement-between-printed-and-actual hazard, opposite direction.
- F335 (slippage lower extreme) and F330 (deadline lower/units extreme) are the two
  numeric-knob-degenerate-value siblings on the swap signing path; bounding both in the same pass keeps
  the parse layer's "reject the obvious footgun" discipline consistent.
- The deadline bound here is the CLI-side counterpart to the SDK-side `validateDeadline` work tracked
  under the swap-deadline-validation ticket / #373. The CLI check rejects the footgun before any RPC or
  sign; the SDK check is the defense-in-depth backstop. Neither replaces the other.
- Candidate existing issue **#419** already covers the CLI amount/slippage/deadline validation surface;
  add this color (decimal-precision, slippage floor, deadline window, and the parse-layer test gap)
  there rather than opening a new ticket, and flag it as important to land during implementation.
- RPC trust is out of scope: every hazard here is a CLI-controlled flag value reaching the signed SDK
  params, independent of any RPC.
