# Remove the unconfirmed auto-submit max collateral pledge on Morpho mount

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Complexity** | 2 / 5 |
| **Domain** | frontend |
| **Surface** | `demoMagic/morphoDemoMagic.ts:9-40` (`useReconcileMorphoCollateral`), wired at `components/earn/borrow/BorrowTab.tsx:24` |
| **Resolves findings** | F304 |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

## Problem

`useReconcileMorphoCollateral` is a render-driven `useEffect` that, on mount of the Borrow tab, walks the user's Morpho lend positions and for every position holding unpledged vault shares (`depositedSharesRaw > 0`) that maps to a borrow market, fires a real on-chain `depositCollateral({ max: true })` with no review modal and no user confirmation (`morphoDemoMagic.ts:27-33`). This is a fund-moving action: `handleTransaction('depositCollateral', ...)` routes straight to `operations.depositCollateral` -> `wallet.borrow.depositCollateral` (`useBorrowProvider.ts:291-296`), submitting a transaction that pledges the user's ENTIRE lend-vault share balance as borrow collateral.

The fund-safety problem is twofold:

1. **No explicit intent.** A user opening the Borrow tab to look at their positions silently signs a max collateral pledge they never requested or confirmed. Pledged shares are no longer freely withdrawable from the lend vault, so the action changes the user's fund state. Every sibling fund-moving flow in this demo (lend, withdraw, swap, manual borrow) goes through a confirm step; this is the one path that moves funds with zero confirmation, and it does so automatically on render.

2. **Misrepresented position state.** After the silent pledge, the user's lend shares show as held but are now encumbered as collateral. The user can believe their vault shares are freely withdrawable when they are pledged. The withdraw flow gates on a health card so the downstream effect is partly surfaced, but the pledge itself is never announced.

The only guard against re-firing is `reconciledRef`, an in-memory `Set` (`morphoDemoMagic.ts:13,25-26`). It resets on every component remount/refresh and is cleared on failure (`morphoDemoMagic.ts:35`), so it retries on the next render. A page refresh before the prior `depositCollateral` settles into `marketPositions` re-arms the guard and can re-fire the pledge against shares that are already mid-pledge. The amount is `{ max: true }`, not bounded to any user-entered value.

This is the demo (frontend) layer; the pledged shares are demo lend-vault shares on a testnet and there is no protocol fund loss. But it is a real on-chain mutation that moves user funds without intent, so it is in-scope as a review-only fund-safety item on the demo surface.

## Findings

- **F304** (`packages/demo/frontend/src/demoMagic/morphoDemoMagic.ts:9-40`) — `useReconcileMorphoCollateral` auto-submits `depositCollateral({ max: true })` on mount via a render `useEffect` (`27-33`) for every unpledged Morpho lend position, with NO review modal and NO user confirmation, gated only by `reconciledRef` (a `Set` that resets on remount/refresh and clears on failure at `35`); it pledges the user's entire lend-vault share balance and can misrepresent freely-withdrawable shares as pledged.

## Root cause

The reconcile effect treats a fund-moving on-chain pledge as a side effect of rendering the Borrow tab. The design intent was demo "magic": automatically convert held lend shares into borrow collateral so the borrow demo has collateral to work with, without making the user perform a separate deposit. To keep it idempotent the author reached for an in-memory `Set` rather than user intent, but a `useEffect` body that calls `handleTransaction(...)` is structurally the wrong place for a fund-moving mutation: it runs unprompted, it runs again on remount, and it has no confirmation gate because effects do not have one. The `{ max: true }` sentinel makes the unprompted action pledge the maximum available, which is the most aggressive variant.

## Recommended approach

Review-only, demo-layer (frontend). No architectural refactor. The goal is to make the collateral pledge require explicit user intent instead of firing automatically on render; the borrow demo still works because the user performs the pledge through the existing confirm path rather than having it done for them silently.

Two viable shapes, in order of preference:

1. **Preferred: require explicit user confirmation before any collateral pledge.** Replace the automatic `void handleTransaction('depositCollateral', { ..., amount: { max: true } })` in the effect with a user-initiated action: surface the unpledged shares as a visible "Pledge as collateral" affordance (the Borrow tab already renders the lend-position selector at `BorrowTab.tsx:24-32`), and run the same `depositCollateral` only when the user clicks it, through the normal confirm/transaction path the other borrow actions use. The pledge then carries explicit intent and is no longer driven by an effect. The effect (and `useReconcileMorphoCollateral` itself) is deleted; its single call site (`BorrowTab.tsx:24`) and import (`BorrowTab.tsx:7`) are removed as orphans of this change.

2. **Minimum (if the auto-reconcile behavior must be retained for the demo): keep but make it intent-gated and re-fire-safe.** If product wants the demo to keep auto-pledging, do not leave it silent: (a) add a one-time visible confirmation (modal or inline confirm) before the first pledge per session rather than firing on mount, (b) persist the reconciled market keys so a remount/refresh with stale `marketPositions` cannot re-pledge (the current in-memory `Set` resets on refresh), and (c) add a visible activity-log entry so the user can see funds were moved. This still removes the silent, unconfirmed, re-fireable property; it is weaker than option 1 because the pledge is still automatic once confirmed.

Recommendation is option 1: a fund-moving pledge should not originate from a render effect at all. Whichever is chosen, this pattern must NOT be promoted outside the demo. Out of scope here: the Aave mirror fire-and-forget (F308) and the borrow CTA/valuation items (F310-F313) are separate tickets; do not pull them in.

## Affected files

- `packages/demo/frontend/src/demoMagic/morphoDemoMagic.ts:9-40` — the `useReconcileMorphoCollateral` effect that auto-submits `depositCollateral({ max: true })`; remove the auto-fire (option 1) or gate it behind explicit confirmation + persisted idempotency (option 2).
- `packages/demo/frontend/src/demoMagic/morphoDemoMagic.ts:13,25-26,35` — the `reconciledRef` `Set` guard that resets on remount and clears on failure; replaced by user intent (option 1) or persisted reconciled-key storage (option 2).
- `packages/demo/frontend/src/components/earn/borrow/BorrowTab.tsx:7,24` — the import and call site of `useReconcileMorphoCollateral`; remove (option 1) or rewire to the confirm affordance (option 2).
- `packages/demo/frontend/src/hooks/useBorrowProvider.ts:291-296` — the `depositCollateral` routing to `operations.depositCollateral`; no change, referenced to show the effect submits a real on-chain pledge.

## Acceptance criteria / tests

- Opening the Borrow tab with an existing Morpho lend position holding unpledged shares submits NO `depositCollateral` transaction without an explicit user action. (Repro of F304: today, mounting the tab fires `depositCollateral(max)` with no modal.)
- A collateral pledge of Morpho lend shares only occurs after an explicit user-initiated confirm (option 1) or an explicit one-time confirmation (option 2); the pledge is never a side effect of render.
- A page refresh / component remount before a prior pledge settles into `marketPositions` does not re-submit a pledge against the same shares (the in-memory `Set` re-fire window is closed — by removing the auto-fire in option 1, or by persisting reconciled keys in option 2).
- No `amount: { max: true }` collateral pledge is dispatched from a `useEffect` in `morphoDemoMagic.ts`.
- If `useReconcileMorphoCollateral` is removed (option 1), its import and call site in `BorrowTab.tsx` are removed and no dead reference remains.
- Demo frontend typecheck / lint / test / build pass.

## Notes

- This is intentional demo "magic," so the fix is a behavior change on the demo surface, not an SDK change. The SDK `depositCollateral` path itself is correct; the issue is the frontend invoking it unprompted from an effect.
- No protocol fund loss: the pledged shares are demo lend-vault shares on a testnet. The finding is fund-safety in the sense of moving user funds (encumbering withdrawable shares) with no intent, and misrepresenting position state, which is why it is medium rather than info.
- The `{ max: true }` sentinel is the most aggressive variant of the unprompted action (pledges everything). If option 2 is taken, consider whether the demo needs `max` or a bounded amount; option 1 lets the user choose.
- Intent-guessing and RPC trust are out of scope. This ticket does not try to infer when a pledge is "probably wanted"; it requires the user to say so. The change is subtractive (delete an auto-fire effect) or gated (add a confirm), both low-risk for the demo.
