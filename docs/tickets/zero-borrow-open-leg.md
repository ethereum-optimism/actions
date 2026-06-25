# Reject or reroute zero-borrow collateral-only opens (Aave/Morpho)

>  AUGMENT existing issue #303 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Complexity** | 2 / 5 |
| **Domain** | borrow |
| **Surface** | `aave/quote.ts:109-111` `encodeAaveBorrow(...,0)`, `morpho/open.ts:58-66` `encodeMorphoBorrow(...,0)`, `morpho/repay.ts:33-47` over-large exact-assets repay (no clamp) |
| **Resolves findings** | F015, F057 |
| **Candidate existing issue** | #303 (augment; F057 also relates to #334) |
| **Blocked by** | (none) |

## Problem

The borrow `open` action lets a caller deposit collateral and draw debt in one bundle. The collateral leg is correctly gated on `> 0n` (Aave `quote.ts:98`, Morpho `open.ts:46-49`), but the borrow leg is appended unconditionally. So a legitimate collateral-only intent (`borrowAmount {amountRaw:0n}`) does not become a `depositCollateral`-only bundle; instead the SDK emits a final `Pool.borrow(asset,0,2,0,user)` / `Morpho.borrow(...,0,...)` leg that the protocol reverts. The whole bundle, including the otherwise-valid collateral deposit and its approvals, reverts on-chain. The caller signs and pays gas for a bundle the SDK already had enough information to know is structurally degenerate, and the only correct way to express "deposit collateral, borrow nothing" is unreachable through `open`.

On the repay side, the Morpho exact-assets branch trusts the caller amount with no bound against live debt. A user passing an exact figure larger than their outstanding borrow (intending a full repay but specifying a stale number rather than `{max:true}`) gets an ERC-20 approval to Morpho Blue sized to the inflated amount, then a `repay(assets,0)` that Morpho reverts when assets exceed the outstanding borrow. The tx fails but the over-sized approval to Morpho Blue stands. The SDK already reads `current.borrowAssets` (carried as `repay.liveDebtAssetsWei`, `repay.ts:52`) at quote time, so it has the number needed to clamp and chooses not to.

Both are the same class: the SDK holds the value that makes the leg correct (a `> 0n` check on the borrow amount, the live-debt snapshot for repay) and fails open into guaranteed-revert / over-approval calldata instead of failing closed or rerouting. Fund-safety framing: the residual over-approval to Morpho Blue is a standing allowance the user did not intend, and the unconditional zero-borrow leg makes a safe collateral-only deposit impossible to express.

## Findings

- **F015** (`packages/sdk/src/actions/borrow/core/internalParams.ts:129-140`, open-path face at `packages/sdk/src/actions/borrow/providers/aave/quote.ts:109-111` and `packages/sdk/src/actions/borrow/providers/morpho/open.ts:58-66`) — borrow amounts are never validated positive/non-zero, unlike the swap sibling; `buildAaveOpenQuoteArgs` and the Morpho open builder unconditionally append the borrow leg even when `borrowAmountWei == 0n`, emitting a guaranteed-revert `Pool.borrow(asset,0,...)` / `Morpho.borrow(...,0,...)` on a collateral-only open. Nothing routes a zero-borrow open to `depositCollateral` or rejects it.
- **F057** (`packages/sdk/src/actions/borrow/providers/morpho/repay.ts:33-47`) — `computeRepay`'s non-max (exact assets) branch sets `repayAssetsWei = amount.amountWei` with no clamp against `current.borrowAssets`; `buildRepayApproval` (`repay.ts:81-86`) then sizes the loan-token approval to that full value and `encodeMorphoRepay` submits `repay(assets,0)`, so an over-large amount reverts on-chain after the user signed an inflated approval to Morpho Blue.

## Root cause

The borrow open builders treat the borrow leg as mandatory: the collateral leg is conditional on `> 0n` but the trailing `encodeAaveBorrow` / `encodeMorphoBorrow` is pushed without inspecting `borrowAmountWei`. Combined with the absence of any positivity guard on the borrow amount (F015's core locus, `internalParams.ts:129-140`, where the swap sibling validates via `validateAmountProvided` + `validateAmountPositiveIfExists`), a `0n` borrow amount flows straight into a borrow-of-zero leg.

For repay, `computeRepay` routes `{max:true}` through the shares path (which the protocol caps to live debt on-chain) but the exact-assets path takes the caller amount verbatim. The live-debt snapshot needed to bound it is already computed and even threaded through as `liveDebtAssetsWei`, but it is only used to size the *shares-path* approval, never to clamp the exact-assets amount. Aave's repay uses `maxUint256` on-chain for full repay and the protocol caps the pull, so the two providers diverge on the same intent.

## Recommended approach

SDK fix. This is missing-obvious-validation plus fail-closed-where-the-SDK-already-knows plus sibling-consistency (Aave vs Morpho open, Aave vs Morpho repay) - all in scope. No intent-guessing beyond the two unambiguous cases below, and no broad refuse-to-sign.

1. **Reject or reroute a zero-borrow open.** Decide one of these per the product owner of #303; both are in scope and the choice is a small product call, not a refactor:
   - **Reroute (preferred):** when `borrowAmountWei == 0n` on an `open` with `collateralAmountWei > 0n`, omit the trailing borrow leg so the bundle is `depositCollateral`-only. This makes the legitimate collateral-only intent expressible through `open` without a separate call. Apply symmetrically in `aave/quote.ts:109-111` (skip the `encodeAaveBorrow` push when `borrowAmountWei == 0n`) and `morpho/open.ts:58-66` (skip the `encodeMorphoBorrow` push). `debtDelta`/`borrowAmountRaw` in the finalized plan must reflect 0.
   - **Reject:** if collateral-only opens are out of `open`'s contract, throw `InvalidAmountError` (or the existing borrow positivity error) for a `0n` borrow on `open`, pointing the caller at `depositCollateral`. This is the simpler change and is the natural extension of the F015 positivity guard at `internalParams.ts:129-140`.
   The reject variant alone closes the guaranteed-revert path; the reroute variant additionally makes the safe intent reachable. Whichever is chosen, apply it identically to Aave and Morpho so the two providers stay consistent.

2. **Add the borrow-amount positivity guard (F015 core).** In the borrow write path / `buildXInternalParams` builders (`internalParams.ts:129-140`), reject non-`max` borrow amounts `<= 0` (both the `amount` and `amountRaw` variants, after wei conversion) with `InvalidAmountError`, matching the swap sibling. This guards the negative/`NaN` cases the open reroute does not address (a negative `borrowAmount` currently encodes a negative bigint while the projected position is clamped to look healthy). A reroute on exactly `0n` and a reject on `< 0` / non-finite are complementary, not alternatives.

3. **Clamp the exact-assets Morpho repay to live debt (F057).** In `computeRepay` (`repay.ts:45-47`), set `repayAssetsWei = min(amount.amountWei, current.borrowAssets)` before sizing the approval and encoding the repay, so an over-large exact amount becomes a full repay rather than a reverting over-pull, and the loan-token approval (`repay.ts:81-86`) is sized to the clamped value (no standing over-approval to Morpho Blue). Alternatively surface an explicit error when the amount exceeds live debt; clamping is preferred because it matches the Aave repay sibling, where full repay caps to the protocol. The repay comment at `repay.ts:60-63` already documents the live-debt-snapshot bound for the shares path; extend that bound to the exact-assets path.

## Affected files

- `packages/sdk/src/actions/borrow/providers/aave/quote.ts:109-111` — `buildAaveOpenQuoteArgs`: gate the `encodeAaveBorrow` push on `borrowAmountWei > 0n` (reroute) or reject `0n` on `open`.
- `packages/sdk/src/actions/borrow/providers/morpho/open.ts:58-66` — Morpho open builder: gate the `encodeMorphoBorrow` push on `borrowAmountWei > 0n` (reroute) or reject `0n` on `open`, symmetric with Aave.
- `packages/sdk/src/actions/borrow/providers/morpho/repay.ts:45-47` — `computeRepay` exact-assets branch: clamp `repayAssetsWei` to `min(amount.amountWei, current.borrowAssets)`.
- `packages/sdk/src/actions/borrow/providers/morpho/repay.ts:81-86` — `buildRepayApproval`: sizes the exact-path approval to the (now clamped) `repay.repayAssetsWei`; confirm the clamp flows through.
- `packages/sdk/src/actions/borrow/core/internalParams.ts:129-140` — borrow amount positivity/finiteness guard (F015 core), rejecting `<= 0` / non-finite non-`max` borrow amounts.
- `packages/sdk/src/core/error/errors.ts` — reuse `InvalidAmountError` (or the existing borrow positivity error); no new error type unless the reject-on-open path wants a distinct message.

## Acceptance criteria / tests

- An `open` with `collateralAmountWei > 0n` and `borrowAmount {amountRaw:0n}` produces, under the chosen variant, either a `depositCollateral`-only bundle whose final leg is NOT a `borrow(...,0,...)` (reroute), or a thrown `InvalidAmountError` (reject) - asserted for both Aave (`quote.ts`) and Morpho (`open.ts`) so the two providers behave identically.
- A reroute bundle's finalized plan reports `debtDelta == 0` / `borrowAmountRaw == 0` and contains no `encodeAaveBorrow` / `encodeMorphoBorrow` leg.
- A non-`max` borrow `open`/`repay`/`deposit`/`withdrawCollateral`/`close` with a negative or non-finite amount throws `InvalidAmountError` before any calldata is encoded (F015), covering the case the zero-reroute does not.
- Morpho exact-assets repay with `amount.amountWei > current.borrowAssets` clamps to `current.borrowAssets`: the encoded `repay` carries the clamped assets, the loan-token approval is sized to the clamped value (no over-approval to Morpho Blue), and the tx does not revert on an over-pull (F057). A repay with `amount.amountWei <= current.borrowAssets` is unchanged.
- The Aave repay sibling is exercised to confirm the clamped Morpho exact-assets behavior matches the Aave full-repay-caps-to-protocol behavior (cross-provider consistency).
- Full SDK `pnpm` typecheck / lint / test / build pass.

## Notes

- Augments #303 (borrow amount-validation cluster; F015's home). F057 separately relates to #334 (Morpho repay clamp); reference both when wiring the PR but the fix is one coherent borrow-path change set.
- Backend sibling-asymmetry (F297, `packages/demo/backend/src/helpers/schemas.ts`): `AmountByRaw` lacks the positivity refine its twin `AmountByHuman` enforces, so `amountRaw:"0"` reaches every fund-moving borrow route at the request boundary. That is a separate one-line backend change tracked in its own review-only item; this SDK ticket closes the gap at the SDK boundary regardless of what the backend sends, so neither depends on the other.
- The reroute-vs-reject choice for the zero-borrow open is a product call on whether `open` should accept a collateral-only intent. Reroute is preferred for ergonomics; reject is the minimal fund-safety close. This is a small contract decision, not an architectural refactor.
- Related but out of scope here (tracked under the F015 cluster, not this ticket): the Morpho exact-amount collateral legs (`MorphoBorrowProvider.ts:190-272`) and the Morpho `max` close snapshot-vs-live asymmetry (`close.ts:36-42`). They share F015's root but are distinct loci; the positivity guard in step 2 covers the zero-collateral case at the central builder, the rest are separate sibling-consistency items.
- RPC trust and intent-guessing are out of scope; this ticket only enforces invariants the SDK already has the data to enforce (`borrowAmount == 0n` is a degenerate borrow leg; exact repay must not exceed the live-debt snapshot the SDK already read).
