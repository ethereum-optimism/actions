---
type: feat
status: active
created: 2026-06-04
origin: docs/brainstorms/2026-06-04-borrow-collateral-model-requirements.md
scope: packages/demo/frontend (with backend reuse via existing endpoints)
---

# feat: Unify Morpho borrow collateral with Aave (lend-chained collateral + honest health)

## Summary

In the demo, borrowing moves the health bar the wrong way for two distinct
reasons. On Morpho a borrow silently pledges the user's still-unpledged lend
(vault) shares as collateral, so collateral grows with the borrow and LTV barely
rises. On Aave the projected LTV is read from the SDK quote's real on-chain
oracle (~$3540/ETH) while the current LTV uses the demo stub ($1770/ETH), so
borrowing flips price source and LTV drops.

The fix makes Morpho behave like Aave: **lending pledges its collateral**
(lend-chain), so collateral always equals the lend position; **borrowing only
borrows** (never pledges more); and **all health math uses one source — the stub
prices**. Composition lives in the frontend as sequences of the existing
`operations` calls, so both the Turnkey (in-browser SDK) and Privy (HTTP
endpoint) paths share one code path with no SDK change, no generic signer, and
no new package. Non-atomic gaps are closed by a reconciliation pass on
borrow-tab open. (see origin: docs/brainstorms/2026-06-04-borrow-collateral-model-requirements.md)

---

## Problem Frame

- **Morpho collateral growth.** `useBorrowTransaction` passes
  `directDepositedSharesRaw` (the unpledged lend shares) as `collateralAmount`
  on a top-up borrow, and `BorrowAction` adds that same spare into
  `projectionCollateralUsd`. Net effect: borrowing supplies collateral, so the
  LTV flat point sits at a nonzero borrow amount (observed ~292 OP).
- **Aave price-source split-brain.** `useBorrowProjection` prefers the SDK
  quote's `positionAfter.ltv` (oracle-priced) over the local stub projection;
  current LTV is stub-priced. Borrowing 1 USDC shows 21.2% → 11.3%.

Both collapse once collateral equals the lend position and health is computed
from a single (stub) price source.

---

## Scope Boundaries

In scope: demo frontend behavior + display across both wallet paths, reusing the
existing lend / borrow operation endpoints.

### Deferred to Follow-Up Work
- Atomic server-side batching of lend + supply-collateral (relying on
  reconciliation instead).
- A standalone "add collateral" user action.

### Out of Scope
- Real price feeds — stub prices ($1770 ETH) remain the source of record.
- Migrating existing/legacy positions.
- Any change to the SDK or to the USDC_DEMO mirror (stays a backend side-effect
  of the borrow endpoint).

---

## Key Technical Decisions

1. **Lend pledges collateral (Morpho only).** On a successful Morpho lend, the
   frontend chains a `borrow.depositCollateral` of the resulting vault shares to
   the matching Morpho borrow market. Aave is excluded — supplying ETH to Aave
   already makes it collateral. Detected via `lendProvider === 'morpho'`.
2. **Borrow never pledges collateral.** The borrow flow stops passing
   `collateralAmount`; collateral changes only via lend / withdraw. After
   lend-chaining there is no spare to pledge anyway, so this is both the
   correctness fix and a safety rail.
3. **One price source for health.** Current and projected LTV / HF are computed
   from the local stub projection; the SDK quote's oracle `ltv` / `healthFactor`
   are not used for display. The whole demo is stub-priced, so this removes the
   split-brain.
4. **Collateral projection = pledged collateral.** `projectionCollateralUsd`
   uses the position's current collateral (which, post-lend-chain, equals the
   full lend) and never adds the unpledged lend balance on top.
5. **Composition in the frontend over existing operations.** No SDK change, no
   generic signer, no new package — the `operations` interface already abstracts
   Turnkey vs Privy, and `borrow.depositCollateral` exists on both adapters.
6. **Reconciliation, not atomicity.** Lend→supply may be two txs; a pass on
   borrow-tab open closes any unpledged delta when no tx is pending.

---

## System-Wide Impact

- **Lend flow** (`Earn.tsx` `handleTransactionWithTracking`) gains a post-lend
  collateral-supply step for Morpho. Pure lenders' shares become borrow
  collateral (acceptable per brainstorm; same property Aave already has).
- **Withdraw flow** must release collateral for *every* Morpho withdraw now
  (all lend is pledged). The existing `useWithdrawCollateral` / `releaseCollateral`
  path already handles fully-pledged release; this plan verifies it.
- **Borrow flow + health display** change as above. Both wallet paths share the
  frontend composition; the Privy path reuses existing HTTP endpoints.
- **Mirror** unchanged.

---

## Implementation Units

Dependency order: U1 → U2 → U4, with U3 and U5 after U1. Full correctness
emerges once U1, U2, U4 land; each unit leaves the app no worse.

### U1. Lend-chain Morpho collateral on lend

**Goal:** After a successful Morpho lend, pledge the resulting vault shares as
collateral to the matching Morpho borrow market, so collateral equals the lend
position (Aave already behaves this way).

**Requirements:** Decisions 1, 5; origin "Lend = collateral on both markets".

**Dependencies:** none.

**Files:**
- `packages/demo/frontend/src/components/earn/Earn.tsx` (orchestrate post-lend supply in `handleTransactionWithTracking`)
- `packages/demo/frontend/src/constants/markets.ts` (resolve lend market → matching Morpho borrow market by `marketParams.collateralToken === lend market address`)
- `packages/demo/frontend/src/components/earn/__tests__/` or co-located spec for the orchestration helper

**Approach:** On `mode === 'lend'` success for a `morpho` lend market, look up the
borrow market whose `marketParams.collateralToken` equals the lend market
address (the vault), then call `borrow.depositCollateral({ marketId, collateralAmount })`
with the wallet's currently-unpledged vault share balance. Skip entirely for
`aave` lend markets. Both wallet paths go through the existing `operations`
(`wallet.borrow.depositCollateral` for Turnkey, `borrowApi.depositCollateral`
for Privy). The supply amount is the full unpledged share balance (robust to
the exact minted amount; reconciliation in U3 backs it up). Pull the borrow
operations into the orchestration site via `useBorrowProviderContext` (already
mounted in `Earn`).

**Patterns to follow:** existing `releaseCollateral` coordination already wired
through `handleTransactionWithTracking`; `borrowCollateralVault` lookup in
`constants/markets.ts`.

**Test scenarios:**
- A Morpho lend resolves to the borrow market whose `collateralToken` matches the lend vault address (helper returns the expected `marketId`).
- A Morpho lend triggers a `borrow.depositCollateral` call with the unpledged share balance; an Aave lend triggers no collateral supply.
- Lend with zero/again-pledged shares is a no-op (no `depositCollateral`).
- Mapping returns nothing for a lend market with no matching borrow market → no supply, no throw.

**Verification:** After lending into the Morpho vault, the Active/lend position
shows the shares as pledged collateral and the borrow market collateral equals
the lent amount, with no separate unpledged remainder.

### U2. Borrow draws against existing collateral only

**Goal:** Stop the borrow flow from pledging collateral; a borrow only borrows.

**Requirements:** Decision 2; origin "Borrow draws against existing collateral".

**Dependencies:** U1.

**Files:**
- `packages/demo/frontend/src/hooks/useBorrowTransaction.ts` (drop the `topUpCollateralSharesRaw` supply; borrow sends only `borrowAmount`)
- `packages/demo/frontend/src/components/earn/borrow/BorrowAction.spec.tsx` (assert no collateral pledged on borrow)

**Approach:** Remove the top-up collateral supply branch so `handleTransaction('open', …)`
carries `borrowAmount` only (no `collateralAmount`). The SDK supports a
borrow-only open for both providers (collateral is optional in Morpho's
`buildOpenTransactions` and Aave's `_openPosition`). Keep the fresh-open guard
only where genuinely no collateral exists yet (covered by U1/U3 having pledged
it).

**Test scenarios:**
- A borrow on an existing position dispatches `open` with `borrowAmount` and no `collateralAmount`.
- Borrowing does not change the displayed collateral amount.

**Verification:** Borrowing increases debt only; collateral is unchanged before
and after.

### U3. Reconcile lend→collateral delta on borrow-tab open

**Goal:** Close any gap where lent shares were not (yet) pledged as collateral
(non-atomic lend, or a failed supply), without a user-facing step.

**Requirements:** Decision 6; origin "Non-atomic steps … covered by reconciliation".

**Dependencies:** U1.

**Files:**
- `packages/demo/frontend/src/components/earn/borrow/BorrowTab.tsx` or `packages/demo/frontend/src/hooks/useBorrowProvider.ts` (detect delta on mount / positions-changed; fire background supply)
- co-located spec

**Approach:** On borrow-tab open / page load, for each Morpho lend position with
an unpledged share balance and no pending borrow tx, fire a background
`borrow.depositCollateral` for the delta. Reuse the existing
`EARN_POSITIONS_CHANGED_EVENT` + delayed-reconcile pattern. Silent (no activity
log entry, consistent with the mirror's silent posture). Guard against
double-firing while a supply is in flight.

**Test scenarios:**
- Unpledged delta + no pending tx → one background `depositCollateral` for the delta.
- No delta → no supply call.
- Pending tx present → no supply (no double-fire).
- Aave positions are never reconciled (no vault-share concept).

**Verification:** After a lend whose supply leg failed, reopening the borrow tab
silently pledges the missing collateral; the health bar then reflects the full
lend.

### U4. Stub-consistent health math

**Goal:** Compute current and projected LTV / HF from one source (stub prices)
so borrowing always moves the bar the right way on both markets.

**Requirements:** Decisions 3, 4; origin "Health uses one price source".

**Dependencies:** U2.

**Files:**
- `packages/demo/frontend/src/hooks/useBorrowProjection.ts` (use the local stub projection for projected LTV/HF; do not prefer the SDK quote's oracle `ltv`/`healthFactor` for display)
- `packages/demo/frontend/src/components/earn/borrow/BorrowAction.tsx` (`projectionCollateralUsd` = current pledged collateral; remove the unpledged-lend addition and the earlier Aave-specific branch now that the rule is uniform)
- `packages/demo/frontend/src/hooks/__tests__/useBorrowProjection.spec.ts` (new or existing), `BorrowAction.spec.tsx`

**Approach:** Drop the `backendLtv`/`backendHf` override for display and rely on
`computeProjection` over stub-priced aggregates for both current and projected.
Set `projectionCollateralUsd` to the position's current collateral (which equals
the full lend after U1) without adding `additionalLendCollateralUsd`. This makes
projected LTV `(currentDebt + delta) / collateral`, strictly increasing in the
borrow amount, identically for Morpho and Aave.

**Test scenarios:**
- Aave: borrowing N increases projected LTV above current (no oracle-driven drop); HF decreases as N grows.
- Morpho: borrowing N increases projected LTV above current; the flat point is at N = 0.
- Repay decreases projected LTV (regression guard).
- Collateral row equals the lent asset amount (no double-count) for both markets — extends the existing `does not double-count` test.

**Verification:** Entering any borrow amount > 0 moves the health bar toward
liquidation on both markets; repaying moves it away.

### U5. Verify withdraw release under always-pledged Morpho collateral

**Goal:** Confirm (and adjust if needed) that withdrawing a Morpho lend position
correctly releases its now-always-pledged collateral.

**Requirements:** origin success criterion "Withdraw releases pledged collateral".

**Dependencies:** U1.

**Files:**
- `packages/demo/frontend/src/hooks/useWithdrawCollateral.ts` (verify release amount when 100% pledged)
- `packages/demo/frontend/src/utils/effectiveLendPositions.ts` (lend row reflects fully-pledged state)
- existing specs

**Approach:** With U1 making the whole Morpho lend pledged, every withdraw must
release first. Verify `useWithdrawCollateral` computes `releaseCollateralAmountRaw`
and gates correctly when `directDepositedAmount` is 0 and all balance is pledged.
Adjust only if a gap surfaces.

**Test scenarios:**
- Withdraw against a fully-pledged Morpho position computes a release amount and gates on projected health.
- Withdraw amount within safe LTV is allowed; beyond it is blocked.

**Verification:** A user who lent then borrowed can still withdraw (within safe
limits); the release leg fires.

---

## Risks & Mitigation

- **Breaking lend for pure lenders.** Lend now pledges collateral. Mitigated:
  brainstorm accepted lend-usable-by-borrow; withdraw still works via release
  (U5). Aave excluded so its lend is untouched in shape.
- **Non-atomic lend→supply leaves an unpledged delta.** Mitigated by U3
  reconciliation; U4's conservative projection (pledged-only) means the health
  shown during a gap is safe (higher LTV), never falsely healthy.
- **Borrow-only open fails if no collateral pledged yet.** Mitigated: U1 pledges
  on lend and U3 reconciles before borrow is meaningful; keep a guard for the
  genuinely-empty case.
- **Aave borrow auto-supply.** U2 removes collateral on borrow for both markets,
  so Aave can't grow collateral on borrow either.

---

## Verification (overall)

- `pnpm --filter actions-ui typecheck test` green.
- Manual: lend Morpho → borrow immediately against full balance; borrowing any
  amount increases LTV; repay decreases it; Aave shows the same direction;
  withdraw works after borrowing.
