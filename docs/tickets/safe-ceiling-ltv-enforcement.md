# Enforce safeCeilingLtv against projected position LTV on borrow/open/withdraw

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 3 (of 5) |
| **Domain** | borrow |
| **Surface** | `core/quote.ts:54` (`safeCeilingLtv` computed, never enforced), `providers/aave/presentation.ts:176,224` (`maxLtv` from liquidation-threshold bits), `providers/aave/state.ts:33-45` (`ltvBps` decoded then discarded), `namespaces/WalletBorrowNamespace.ts:207-247` (dispatch gate with no solvency check) |
| **Resolves findings** | F055, F018, F117 |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

## Problem

The borrow SDK computes a conservative safety value, `safeCeilingLtv`, and returns it on every quote, advertising a ceiling below the on-chain liquidation LTV. Three distinct defects make that advertised ceiling untrustworthy, and all three are fund-safety relevant because callers (UIs, agents) size borrows against the value the SDK hands them:

1. **The ceiling is never enforced (F055).** `assembleBorrowQuote` sets `safeCeilingLtv = positionAfter.maxLtv * (1 - healthBufferPct)` and returns it, but no point in the open -> `assembleQuote` -> `dispatch` path compares the projected `positionAfter` LTV/health against `safeCeilingLtv` (or even against the hard `maxLtv`). A borrow that lands the position above the SDK's own advertised safe ceiling, right up to the on-chain liquidation edge, is quoted and dispatched with no SDK-side warning. The quote simultaneously reports a "safe" ceiling well below the position it just signed. The hard `maxLtv` is enforced on-chain (the tx reverts past it), so this is not an unbounded drain, but it is a settle-worse-than-displayed gap: the position the wallet signs can be immediately liquidatable while the quote reported headroom.

2. **The Aave ceiling is computed from the wrong LTV bits (F117).** `decodeReserveConfig` correctly decodes both the borrow LTV (bits 0-15) and the higher liquidation threshold (bits 16-31), but only the liquidation threshold is forwarded; `ltvBps` is read then thrown away. `maxLtv` is then populated from the liquidation-threshold bits, so for a typical reserve (e.g. WETH borrow-LTV 80% / liquidation threshold 82.5%) the SDK reports `maxLtv = 0.825` instead of `0.80`. The derived `safeCeilingLtv` overstates safe borrow capacity by roughly 2-3 percentage points, pushing the "safe" number past Aave's actual max borrow LTV, into territory `Pool.borrow` itself may reject and that erodes the intended health buffer.

3. **The ceiling can go negative on misconfig (F018).** `healthBufferPct` resolves per-market -> settings -> `0.05` default and is never validated within `[0, 1)`. A configured value `> 1` (e.g. `1.5`) makes `1 - healthBufferPct` negative, so every quote's `safeCeilingLtv` is negative and meaningless; a UI/agent gating borrow size on it could under- or over-borrow.

Fund-safety framing: defects 2 and 3 are the SDK miscomputing a value it already has the inputs to compute correctly (wrong bits decoded; an unvalidated config factor); defect 1 is the SDK declining to act on a solvency condition it has already projected. All three are in-scope as missing-obvious-validation and fail-closed-where-the-SDK-already-knows, plus a sibling-consistency fix (Aave vs Morpho `maxLtv` semantics).

## Findings

- **F055** — `assembleBorrowQuote` returns `safeCeilingLtv` (`packages/sdk/src/actions/borrow/core/quote.ts:54`) but no borrow path (open, increase borrow, withdraw collateral) compares the projected `positionAfter` LTV/health against it before assembling or dispatching the quote; `WalletBorrowNamespace.validateQuoteForThisWallet` (`packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:207-221`) checks recipient/action/expiry/chain/allowlist only and `dispatch` (`:232-247`) signs the bundle verbatim.
- **F018** — `safeCeilingLtv` goes negative when `healthBufferPct` is configured `> 1`; `healthBufferPct` is never validated in `[0, 1)` (resolved at `packages/sdk/src/actions/borrow/core/BorrowProvider.ts:85,267`, consumed at `core/quote.ts:54`).
- **F117** — Aave `maxLtv` (and the derived `safeCeilingLtv`) is populated from the liquidation-threshold bits, not the borrow-LTV bits: `decodeReserveConfig` decodes both `ltvBps = data & 0xffff` and `liquidationThresholdBps = (data >> 16) & 0xffff` (`packages/sdk/src/actions/borrow/providers/aave/state.ts:40-41`), but only `liquidationThresholdBps` is forwarded (`state.ts:142,208-210`) and `toAaveBorrowMarket` / `toAaveBorrowPosition` both set `maxLtv: bpsToFraction(state.liquidationThresholdBps)` (`providers/aave/presentation.ts:176,224`), overstating safe borrow capacity by ~2-3pp.

## Root cause

`safeCeilingLtv` was added to the quote envelope as a display value and wired through the shared `assembleBorrowQuote` core, but the three pieces that make it a real safety guarantee were never completed: (a) no gate compares the SDK's own projected post-action LTV/health against the ceiling at any stage of open -> dispatch; (b) on the Aave provider the value feeding the ceiling is decoded from the wrong reserve-config bits, so even the displayed number is wrong; (c) the `healthBufferPct` factor that scales the ceiling is an unvalidated config input. The Morpho sibling is closer to correct: it uses `morphoWadToNumber(config.marketParams.lltv)` for `maxLtv`, and since Morpho Blue has a single `lltv` (no separate borrow-vs-liquidation LTV), Morpho's `maxLtv` legitimately rides the liquidation LTV. The "Aave disagrees with Morpho" framing in the original F117 overstates the divergence and should be dropped; the load-bearing defect is that Aave alone has two distinct LTV values and surfaces the wrong one.

## Recommended approach

Land all three as a single coordinated change in the borrow SDK (refactors are in scope here):

1. **Decode the correct Aave LTV (F117).** Forward `ltvBps` through `AaveMarketState` / `AavePositionState` alongside the existing `liquidationThresholdBps`, and populate `maxLtv` from `bpsToFraction(state.ltvBps)`. Keep `liquidationThresholdBps` solely for health-factor / liquidation-price math (it is already used that way at `presentation.ts:143`). Decide and document one consistent meaning for `maxLtv` across both providers: it should convey the max *borrowable* LTV. Morpho already rides its single `lltv`; document that Morpho Blue has no separate borrow LTV so its `maxLtv` is the liquidation LTV by construction.

2. **Validate `healthBufferPct` (F018).** Validate `healthBufferPct` is within `[0, 1)` at construction / resolution and throw `InvalidParamsError` (matching the existing borrow error taxonomy) on an out-of-range config, rather than silently emitting a negative `safeCeilingLtv`. Clamping `1 - healthBufferPct` to `>= 0` is the weaker fallback; prefer fail-loud at config time since this is a deterministic input check.

3. **Enforce the ceiling (F055) — present BOTH options, fail-closed needs product sign-off.** `safeCeilingLtv` enforcement changes borrow behavior, so the two options must be decided with product before implementation:

   - **Advisory (default, no sign-off needed).** Keep `safeCeilingLtv` as a returned field but make it honest and documented: fix the inputs (steps 1-2) so the value is correct, and explicitly document in the public types/JSDoc that `safeCeilingLtv` is advisory display-only and is NOT enforced by `dispatch`. This closes the "displayed safety margin disagrees with the signed position" surprise without changing who can borrow.
   - **Fail-closed (REQUIRES product sign-off).** Add a solvency gate in the shared borrow core (so Aave and Morpho behave identically) that, on borrow-increasing / collateral-decreasing actions, compares the projected `positionAfter` LTV against `safeCeilingLtv` and rejects (or surfaces a structured warning the caller must override) when the projection exceeds the ceiling. This is a behavior change: it will block borrows that are valid on-chain but above the SDK's advertised buffer, so it needs product agreement on reject-vs-warn and on whether callers can opt out. Implement in `core/quote.ts` / the shared assemble path, not per-provider, to keep siblings consistent.

   Recommendation: ship steps 1-2 plus the advisory documentation immediately (pure correctness, no behavior change), and gate the fail-closed enforcement on product sign-off.

No demo/CLI changes are required for this ticket; if a demo surface reads `safeCeilingLtv`, that is review-only (confirm it does not present the pre-fix overstated value as a hard limit) with no refactor.

## Affected files

- `packages/sdk/src/actions/borrow/core/quote.ts:54` — `safeCeilingLtv` computed here; advisory documentation and/or the shared enforcement gate land here.
- `packages/sdk/src/actions/borrow/core/BorrowProvider.ts:42,85,267` — `healthBufferPct` default and resolution; add `[0, 1)` validation.
- `packages/sdk/src/actions/borrow/providers/aave/state.ts:33-45,142,208-210` — decode and forward `ltvBps` (currently discarded).
- `packages/sdk/src/actions/borrow/providers/aave/presentation.ts:176,224` — populate `maxLtv` from `ltvBps` instead of `liquidationThresholdBps`.
- `packages/sdk/src/actions/borrow/providers/morpho/presentation.ts:40,84` — confirm/document Morpho `maxLtv` rides `lltv` (no change to logic, possible JSDoc).
- `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:207-247` — `validateQuoteForThisWallet` / `dispatch`; site for the fail-closed gate if product approves (else no change).

## Acceptance criteria / tests

- **F117:** Given a reserve config with `ltvBps = 8000`, `liquidationThresholdBps = 8250`, `market.maxLtv === 0.80` (not `0.825`); and `safeCeilingLtv === 0.80 * (1 - healthBufferPct)`. Assert `safeCeilingLtv <= market.maxLtv` and that the ceiling never exceeds the on-chain borrow LTV.
- **F018:** Constructing/resolving a provider with `healthBufferPct = 1.5` throws `InvalidParamsError` at config time (or, if the clamp fallback is chosen, `safeCeilingLtv >= 0` for every quote). Add an explicit unit test for the out-of-range value.
- **F055 (advisory path):** `safeCeilingLtv` is documented as advisory in the public type/JSDoc; a test asserts the returned value matches `maxLtv * (1 - healthBufferPct)` with the corrected `maxLtv`.
- **F055 (fail-closed path, if approved):** A unit test in the shared core where the projected `positionAfter` LTV exceeds `safeCeilingLtv` asserts the borrow-increasing / collateral-decreasing quote is rejected (or returns the structured warning), and that an identical scenario is rejected the same way on both the Aave and Morpho providers.
- Sibling consistency: a test asserting Aave and Morpho agree on the documented meaning of `maxLtv` (borrowable LTV) given equivalent inputs.
- Tests follow Rule 9: each encodes WHY (e.g. "a borrow above the advertised buffer must not be silently dispatched"), not just the numeric echo. Note the existing Aave write spec hard-codes oracle/config values and echoes the input back, so projection bugs are invisible there; the exact-state assertions belong in the consolidated Anvil borrow feature-test, not this unit-level ticket.

## Notes

- The real on-chain (exact-state, recompute-independently-of `quote.positionAfter`) verification of the corrected `maxLtv` / health projection belongs to the single consolidated Anvil borrow feature-test, not here. This ticket is the SDK-side correctness + validation + (optional, sign-off-gated) enforcement change; the unit tests above pin the decoding and config-validation behavior.
- Per review pass 11, drop the original F117 "Aave disagrees with Morpho" framing: both providers legitimately surface the liquidation LTV as `maxLtv` only because Morpho Blue has a single `lltv`. The standing defect is that Aave has two distinct LTV values and forwards the wrong one; that is what this ticket fixes.
- F055 and F018 are two defects in the same `core/quote.ts:54` expression (no enforcement; negative-on-misconfig), and F117 supplies the wrong input to that same expression, so fixing them together avoids landing a half-correct ceiling.
- RPC trust is out of scope: the reserve `configData` bitmap is read from the integrator-supplied RPC, which is a documented assumption, not part of this ticket.
