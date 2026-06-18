# Close lend/withdraw double-submit window with a synchronous executing ref

| | |
|---|---|
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | frontend (demo) |
| **Surface** | `packages/demo/frontend/src/components/earn/Action.tsx:178-219` (`runTransaction`), `:221-249` (`handleCtaClick`/`handleReviewConfirm`); `packages/demo/frontend/src/mutations/useLendPosition.ts:48-75` (open/close `mutationFn`); `packages/demo/frontend/src/hooks/useWalletBalance.ts:263-296` (`handleTransaction` → `mutateAsync`) |
| **Resolves findings** | F317 |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

This is a **review-only, no-refactor** demo-frontend ticket. The single finding is a low-risk fund-safety/consistency fix that brings the lend/withdraw action into parity with the borrow flow's existing synchronous `executingRef`. No architectural refactor of the lend surface is in scope.

## Problem

Lend and withdraw are the demo's fund-moving deposit/withdraw flow, and they are the only such flow whose double-submit protection is **entirely async React state**. The CTA gate (`isActionDisabled`) folds in an `isLoading` `useState`, and `runTransaction` only flips `setIsLoading(true)` *after* that gate has already been evaluated. React Query does not dedupe concurrent `mutateAsync` calls on the same mutation instance, and the CTA button has no debounce, so two synchronous taps within one render tick both observe `isLoading === false`, both pass the gate, and both dispatch `openPositionMutation`/`closePositionMutation`. The result is two on-chain deposit/withdraw transactions moving real user principal when the user intended one.

The borrow sibling already closes exactly this window with a synchronous `useRef` guard checked-and-set before the first `await`. Lend/withdraw (and the swap flow, tracked separately as F307) are the siblings that drifted: the SDK/borrow code already knows the correct pattern, lend just does not use it. This is the fund-safety signal a deposit/withdraw most needs: *one tap, one transaction.*

## Findings

- **F317** (low, correctness) — `Action.tsx:221` `handleCtaClick` checks `isActionDisabled` (which folds in `isLoading`, the `useState` declared at `Action.tsx:104`, gate at `:153-161`), then `runTransaction` (`Action.tsx:178`) calls `setIsLoading(true)` only at `:187`, *after* the gate, before awaiting `onTransaction` → `useWalletBalance.handleTransaction` (`:263-296`) → `openPositionMutation/closePositionMutation.mutateAsync` (`:283-284`). React Query does not dedupe concurrent `mutateAsync` on the same instance, so two synchronous taps both dispatch the deposit/withdraw. The review-modal Confirm path has the same exposure: `handleReviewConfirm` (`Action.tsx:247`) calls the same `runTransaction`, and the modal's Confirm is gated only by `isExecuting={isLoading}` (`Action.tsx:340`). Borrow closes the window with a synchronous `executingRef` (`useBorrowTransaction.ts:47` declared, checked-and-set at `:60-61` before any `await`).

## Root cause

The lend/withdraw confirm path treats `isLoading` (async React state) as the reentry guard, but React state is not synchronous: it does not update within the same render tick, so a second tap in the same tick reads the stale `false` before the first dispatch has flipped it. The gate also evaluates *before* `runTransaction` sets the flag, widening the window further. There is no synchronous primitive (a `useRef`) that flips the instant `runTransaction` starts and bails the second entrant before its `mutateAsync`. The borrow flow already added exactly this primitive; lend/withdraw is the inconsistent sibling on a path that moves real principal.

## Recommended approach

Review-only demo fix that brings lend/withdraw to parity with the existing borrow guard. No new abstraction, no lend-surface refactor — mirror the pattern already present in `useBorrowTransaction.ts`.

**F317 — synchronous reentry guard (low).**
- Add a `useRef(false)` `executingRef` in the lend `Action` component (alongside the existing `isLoading` `useState`). At the top of `runTransaction` (`Action.tsx:178`), bail synchronously if `executingRef.current` is already set, otherwise set it `true` *before any `await`* — mirroring `useBorrowTransaction.ts:47,60-61` exactly. Clear it in the existing `finally` block (`Action.tsx:216-218`) next to `setIsLoading(false)`.
- Because both `handleCtaClick` (`Action.tsx:244`) and `handleReviewConfirm` (`Action.tsx:249`) funnel into the same `runTransaction`, guarding `runTransaction` closes both the direct-CTA and the review-modal Confirm windows in one place.
- Keep the existing `isLoading` `useState` for button disabling and the `Processing...` CTA text (`Action.tsx:84`); the ref closes the same-tick window the state cannot, it does not replace the state.
- The mutation-side alternative (guarding inside the `useOpenPosition`/`useClosePosition` `mutationFn`, `useLendPosition.ts:48-75`) is also viable, but the component-level guard matches the borrow placement and covers both CTA and review-Confirm entry points without threading a ref through `onTransaction`. Prefer the `Action.tsx#runTransaction` placement for sibling parity.

## Affected files

- `packages/demo/frontend/src/components/earn/Action.tsx:104` — add `executingRef = useRef(false)` near the `isLoading` `useState`
- `packages/demo/frontend/src/components/earn/Action.tsx:178-219` — `runTransaction`: synchronous check-and-set at entry (before `setIsLoading(true)`/the first `await`), clear in `finally`
- `packages/demo/frontend/src/components/earn/Action.tsx:221-249` — `handleCtaClick`/`handleReviewConfirm` (both reach the guarded `runTransaction`; no per-handler change needed)
- Reference (parity target, not edited): `packages/demo/frontend/src/hooks/useBorrowTransaction.ts:47,60-61` (`executingRef` declared and checked-and-set), `packages/demo/frontend/src/hooks/useWalletBalance.ts:263-296` (`handleTransaction` → `mutateAsync` dispatch the guard protects)

## Acceptance criteria / tests

- **F317:** Two synchronous calls to `runTransaction` (direct CTA path) within one render tick dispatch the lend/withdraw `mutateAsync` exactly once. Test by invoking the handler twice before the first promise resolves and asserting a single `openPositionMutation`/`closePositionMutation.mutateAsync` (or single `onTransaction`) call.
- **F317:** The review-modal Confirm path (`handleReviewConfirm`) is covered by the same guard: two synchronous Confirms dispatch exactly once.
- **F317:** The guard clears on completion (`finally`), so a *sequential* second lend/withdraw after the first settles still dispatches normally (no permanent lockout).
- General: existing lend/withdraw tests and the demo frontend build/typecheck/lint stay green; no behavior change to the happy-path single-tap lend/withdraw.

## Notes

- This is a **demo-frontend** finding, not an SDK finding. It is the lend/withdraw twin of the swap double-submit work (F307, tracked in `docs/tickets/swap-quote-staleness-and-double-submit.md`) and shares the borrow flow's `executingRef` parity pattern. No new SDK ticket is opened.
- **Sibling consistency.** Three fund-moving demo flows exist: borrow already has the synchronous `executingRef` guard; swap (F307) and lend/withdraw (F317) are the two siblings missing it. Closing F317 leaves swap (its own ticket) as the last sibling to bring to parity.
- **Not the same as F309.** F309 covers the missing client idempotency key + 30s timeout-abort double-submit window for lend/swap/borrow at the API-client layer; F317 is the same-render-tick component-level reentry window. They are complementary, not duplicates.
- **No SDK or backend change required.** The fix is a single client-side ref in the lend dispatch wrapper; the backend's own idempotency behavior is out of scope for this ticket.
