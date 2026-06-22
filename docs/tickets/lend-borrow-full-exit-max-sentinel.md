# Provide a dust-free full-exit (max) path for lend close and Morpho max-close

> **AUGMENT existing issue #209 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 4 / 5 |
| **Domain** | lend |
| **Surface** | `MorphoLendProvider`/`AaveLendProvider` close (assets-denominated, no `maxUint256`/`redeem`), `borrow/providers/morpho/close.ts` `{max:true}` collateral snapshot, frontend repay-full dispatch |
| **Resolves findings** | F013, F015, F314 |
| **Candidate existing issue** | #209 |
| **Blocked by** | (none) |

## Problem

"Close my position" / "repay in full" is supposed to leave the user with zero balance and zero debt. On three sibling paths the SDK cannot actually deliver a clean full exit, because every "full" amount is a fixed quantity captured at quote time and the underlying balance moves (interest accrues, collateral can be partially liquidated) between quote and execution:

- **Lend close (both providers)** is purely assets-denominated. To fully close, the caller must pass the exact live underlying balance as a `bigint`; there is no `type(uint256).max` withdraw-all sentinel and no `redeem(shares)` path. A balance that is even slightly stale either exceeds `maxWithdraw` and reverts, or under-withdraws and strands the accrued interest as residual dust. The user believes the position is closed; it is not.
- **Morpho borrow max-close** resolves a `{ max: true }` collateral leg to a fixed quote-time `bigint` snapshot (`after.collateral`) and encodes that verbatim. Aave's collateral withdraw resolves a live `maxUint256` on-chain sentinel. So if collateral moves between quote and execution (e.g. a partial liquidation), the Aave max-close clears to the live balance while the Morpho max-close reverts on the over-withdraw — a cross-provider max-semantics asymmetry that only bites under staleness.
- **Frontend repay-full** never threads the SDK's `{ max: true }` sentinel at all, so the demo's "Max" button submits a fixed float that is always slightly below the interest-accrued debt at execution and leaves residual dust debt.

None of these is an over-withdraw / over-repay fund-loss (the SDK and protocols floor at the live outstanding balance), so the framing is *defeats the user's explicit intent to fully exit* and *strands accrued interest* rather than *loses principal*. The fix is to give the SDK a true full-balance close path and make the "max" semantics live and symmetric across providers — the SDK already knows how to do this on one path (Aave's `maxUint256`) and simply does not do it consistently.

## Findings

- **F013** — `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:107-114`: `_closePosition` builds `MetaMorphoAction.withdraw(assets = params.amount, receiver, owner)`, an exact-assets ERC-4626 withdraw; no `type(uint256).max` sentinel and no `redeem(shares)` path, so a stale full-balance amount reverts (`maxWithdraw < amount`) or strands dust shares.
- **F015** — `packages/sdk/src/actions/borrow/core/internalParams.ts:129-140`: the borrow amount layer already models a first-class `{ max: true }` sentinel (`toAmountWeiOrMax` → `isMaxAmount` at :134-140), but lend close has no equivalent at all; this ticket carries the lend-side of that asymmetry, where `AmountOrMax`/`{max:true}` exists for borrow but `LendClosePositionParams.amount` is a bare `bigint` (`types/lend/base.ts:293-304`). The positivity-guard half of F015 (zero/negative amounts) is tracked under the borrow validation ticket; here the relevant gap is the missing full-exit sentinel.
- **F314** — `packages/demo/frontend/src/hooks/useBorrowTransaction.ts:99-102` (repay dispatch), `BorrowAction.tsx:147,183-187`, `useBorrowQuotePreview.ts:69`: `handleMax` deliberately sets `amount = activePosition.borrowAmountFormatted` (exact-debt string, "exact string avoids dust"), but `BorrowAction.tsx:147` `parseFloat(amount)` drops precision and both the preview (`useBorrowQuotePreview.ts:69`) and `runTransaction` (`useBorrowTransaction.ts:101`) always submit `{ amount: amountNum }` — a fixed float — even when the user chose repay-in-full, so a full repay computed at review time is always below the interest-accrued debt at execution and leaves residual dust debt (trips `DEBT_DUST_THRESHOLD`/repay-gate).

Supporting refinement rows from the ledger that this ticket folds in:
- `AaveLendProvider.ts:291-342` (`refines:F013`): Aave native (`_closeETHPosition`) and ERC-20 (`_closeERC20Position`, :345-381) close approve/withdraw only `params.amount` of the aToken; accrued interest is stranded, no max/all path.
- `borrow/providers/morpho/close.ts:36-42` (`refines:F015`): `resolveWithdrawCollateral` resolves `{ max: true }` to `after.collateral` (fixed quote-time `bigint`) with no live `maxUint256` equivalent of Aave's `buildAaveCollateralWithdraw` sentinel.

## Root cause

There is no canonical "full balance" representation on the lend close path, and the borrow max-close has two different implementations of "max". The SDK already proves it knows how to express a live full exit: Aave borrow collateral withdraw uses `onChainAmount = isMax ? maxUint256 : amount` (`borrow/providers/aave/write.ts:114-115`), letting the protocol resolve the live balance at execution. But:

- Lend close (`LendClosePositionParams.amount: bigint`, `types/lend/base.ts:297`) has no `max`/`all` variant at all — it is assets-only, computed off a read that is already stale by the time the tx lands.
- Morpho borrow max-close snapshots `after.collateral` (a projection-time `bigint`) instead of emitting a live sentinel, so its "max" is a fixed number while Aave's "max" is a live `maxUint256`.
- The demo never reaches the borrow `{ max: true }` sentinel because `parseFloat` collapses the exact-debt string into a float before dispatch.

So "max" means three different things across three siblings, and on the lend path it cannot be expressed at all.

## Recommended approach

Stay inside the missing-obvious-validation / fail-closed-where-the-SDK-already-knows / sibling-consistency scope. The SDK already has the live-sentinel pattern; the work is to add it where it is missing and make it consistent.

**SDK (refactor allowed):**

1. **Lend full-exit path (F013):** add a first-class full-close variant to the lend close API rather than forcing callers to pass a stale `bigint`. Two viable shapes, pick one and apply to both providers:
   - a `{ max: true }` sentinel on `LendClosePositionParams.amount` (mirroring the borrow `AmountOrMax` model at `internalParams.ts:134-140`), or
   - an explicit `redeem(shares)` / `closeAll` flag.
   - For **Morpho** (`MorphoLendProvider.ts:107-114`): when full-close is requested, encode `MetaMorphoAction.redeem(shares = maxRedeem/full share balance, receiver, owner)` (shares-denominated) instead of `withdraw(assets)`, so the exit is not sensitive to inter-block asset accrual.
   - For **Aave** (`AaveLendProvider.ts:291-381`): pass `type(uint256).max` as the withdraw `amount` on both the WETHGateway (`withdrawETH`) and direct `Pool.withdraw` paths, and size the aToken approval to the live balance (never the `maxUint256` sentinel) — exactly the pattern already in `borrow/providers/aave/write.ts:115-121`.

2. **Morpho borrow max-close symmetry (F015 refinement):** make the Morpho `{ max: true }` collateral leg use a live full-balance withdraw rather than the `after.collateral` snapshot in `close.ts:36-42`, so it clears to the live balance like Aave's `maxUint256` path instead of reverting on a stale over-withdraw. Where Morpho Blue has no native max sentinel for `withdrawCollateral`, resolve the live collateral balance at dispatch (read-at-execution) rather than baking the projection-time figure.

3. **Approval sizing:** wherever a `maxUint256` sentinel is used for the withdraw/redeem leg, the ERC-20/aToken approval must still be sized to the real live balance, not to `maxUint256` — follow the existing comment and code at `borrow/providers/aave/write.ts:115-121`.

**Demo (review-only, no architectural refactor — F314):** this is a low-risk wiring fix, not a redesign. When the user clicks Max in repay mode (`canRepayFull`/`debtBalance >= outstandingDebt`, `BorrowAction.tsx:183-187`), thread the `{ max: true }` sentinel through `amount` → `runTransaction` → `handleTransaction('repay', { amount: { max: true } })` (`useBorrowTransaction.ts:99-102`) and the matching preview (`useBorrowQuotePreview.ts:69`) instead of `{ amount: parseFloat(...) }`, so the SDK resolves the live full debt at dispatch. Keep the float-amount path for partial repays. No state-machine or component refactor is requested.

This is not the borrow health-factor item, so no advisory-vs-fail-closed product decision is required here.

## Affected files

- `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:107-114` — assets-only `withdraw`, no `redeem`/max path (F013)
- `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:290-342` — `_closeETHPosition` approves/withdraws only `params.amount`, no max (refines F013)
- `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:345-381` — `_closeERC20Position` same exact-amount withdraw, no max (refines F013)
- `packages/sdk/src/types/lend/base.ts:293-304` — `LendClosePositionParams.amount: bigint` has no `{ max: true }`/`AmountOrMax` variant (F013/F015)
- `packages/sdk/src/actions/borrow/providers/morpho/close.ts:36-42` — `{ max: true }` collateral leg resolves to `after.collateral` snapshot, no live sentinel (refines F015)
- `packages/sdk/src/actions/borrow/providers/aave/write.ts:114-121` — reference implementation: `onChainAmount = isMax ? maxUint256 : amount`, approval sized to live balance
- `packages/sdk/src/actions/borrow/core/internalParams.ts:134-140` — `toAmountWeiOrMax`/`isMaxAmount`, the borrow `{ max: true }` model to mirror for lend
- `packages/demo/frontend/src/hooks/useBorrowTransaction.ts:99-102` — repay dispatch hardcodes `{ amount: amountNum }` (review-only, F314)
- `packages/demo/frontend/src/components/earn/borrow/BorrowAction.tsx:147,183-187` — `parseFloat(amount)` drops the exact-debt string `handleMax` preserves (review-only, F314)
- `packages/demo/frontend/src/hooks/useBorrowQuotePreview.ts:69` — preview also submits the fixed float (review-only, F314)

## Acceptance criteria / tests

SDK:

- **Lend full close, Morpho:** a `closePosition` full-exit request encodes a shares-based `redeem` (or `maxUint256` withdraw) leg, not an exact-assets `withdraw(B)` from a stale read. A test that snapshots balance `B` then accrues interest before execution must pass the full close (it currently reverts / strands dust when the amount is a fixed `B`). The test must fail if the encoder reverts to assets-denominated `withdraw(params.amount)`.
- **Lend full close, Aave:** native (`withdrawETH`) and ERC-20 (`Pool.withdraw`) full-exit paths emit `type(uint256).max` as the withdraw amount, and the aToken/ERC-20 approval is sized to the live balance, never `maxUint256`. Assert the approval amount ≠ the on-chain `maxUint256` sentinel.
- **Morpho max-close symmetry:** with collateral reduced between quote and execution (simulated partial liquidation), the Morpho `{ max: true }` collateral close clears to the live balance (parity with Aave), rather than reverting on the `after.collateral` over-withdraw. The test must fail if the leg is re-pinned to the projection-time `after.collateral`.
- Each test encodes *why*: the full exit must survive inter-block balance movement, not merely produce calldata.

Demo (review-only):

- Clicking Max in repay mode dispatches `{ amount: { max: true } }` to both the preview and `runTransaction` (assert the sentinel reaches `handleTransaction('repay', ...)`), and a partial repay still dispatches the float amount.

## Notes

- This augments **#209**. The shares-vs-assets choice for Morpho lend (`redeem` vs `maxUint256` withdraw) is an implementation detail for the implementer; `redeem(shares)` is preferred because ERC-4626 full exits are share-denominated and immune to asset-side rounding/accrual.
- No over-withdraw/over-repay fund-loss exists today — the protocols and the SDK floor at the live outstanding balance — so severity is medium (defeats intent-to-close, strands accrued interest), not high.
- The borrow zero/negative positivity guard (the other half of F015) is a separate validation ticket; this ticket covers only the full-exit / max-sentinel symmetry, not the `<= 0` rejection.
- RPC-trust is out of scope (integrators supply their own RPC); the "live balance at execution" semantics here rely on the protocol's own on-chain resolution of `maxUint256`/`maxRedeem`, not on any new RPC assumption.
- The demo change is the lowest-risk item and is review-only: a sentinel-threading wiring fix, explicitly not a component/state-machine refactor.
