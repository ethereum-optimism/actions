---
status: ready-for-plan
created: 2026-06-04
scope: demo (packages/demo/frontend, packages/demo/backend)
---

# Borrow Collateral Model — Unify Morpho with Aave (demo)

## Problem

Borrowing in the demo moves the health bar the wrong way. Two distinct causes:

1. **Morpho collateral grows on borrow.** A Morpho borrow silently supplies the
   user's still-unpledged lend (vault) shares as collateral, so collateral
   grows with each borrow and the LTV barely rises — its flat point sits at a
   nonzero borrow amount instead of zero (observed: ~292 OP keeps LTV flat).
2. **Aave health is split-brain on price source.** Current LTV is computed from
   demo stub prices ($1770 ETH); projected LTV comes from the SDK quote's real
   Aave oracle (~$3540 ETH). Borrowing flips the price source, so the LTV
   *drops* (observed: 21.2% → 11.3% on a 1 USDC borrow, HF 6.92).

## Goal

Borrowing always increases LTV (worsens health), consistently, on both markets.
Users can borrow against their full lent balance at any time, and the displayed
health matches what actually executes.

## Model decisions

- **Lend = collateral on both markets.** Aave already behaves this way (supply
  *is* collateral). Morpho "lend-chains": lending also supplies the resulting
  vault shares as collateral to the Morpho Blue borrow market, so collateral
  equals the lend position and there is no unpledged state.
- **Borrow draws against existing collateral; it does not pledge more.**
  Collateral changes only via lend / withdraw, never as a side-effect of a
  borrow.
- **Health uses one price source — the demo stub prices** — for both current and
  projected LTV / health factor. The SDK quote's oracle-based `ltv` / `healthFactor`
  are ignored for display.
- **Composition lives in the frontend**, expressed as sequences of the existing
  operation calls. The frontend `operations` interface already abstracts
  Turnkey (SDK in-browser) vs Privy (existing HTTP endpoints), so no SDK change,
  no generic "sign" endpoint, and no new shared package are needed.
- **Non-atomic steps are acceptable**, covered by reconciliation: on borrow-tab
  open / page load, if the lent shares are not fully pledged as collateral and
  no tx is pending, fire a background `depositCollateral` to close the delta.
  Batch in-browser (Turnkey) when the amount is known up front.
- **Mirror is unchanged**: USDC_DEMO minting stays a backend side-effect of the
  existing borrow endpoint.

## Scope

- Demo only. Existing / legacy positions are not migrated.
- Morpho gains the lend→collateral chaining; Aave already supplies on lend.
- Both wallet paths (Turnkey frontend, Privy server) via the shared `operations`
  interface and the existing semantic endpoints.

## Out of scope / deferred

- Atomic server-side batching of lend + supply-collateral.
- Real price feeds — stub prices remain the source of record ($1770 ETH).
- A standalone "add collateral" user action — collateral changes via lend /
  withdraw only.

## Success criteria

- Any borrow amount > 0 increases the projected LTV vs current, on both Morpho
  and Aave; health factor decreases as the borrow amount increases.
- After lending, the user can immediately borrow against the full lent balance
  (collateral already pledged).
- Collateral shown in the Health card equals the lent amount — no double-count,
  no growth-on-borrow.
- Withdraw releases pledged collateral as needed (existing release flow).

## Assumptions

- Stub ETH = $1770 is the display price of record across the demo.
- Reconciliation runs on borrow-tab open / page load: "no pending tx + nonzero
  unpledged delta → supply collateral."
