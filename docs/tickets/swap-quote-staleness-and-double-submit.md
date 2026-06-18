# Surface swap quote staleness and close the swap double-submit window

| | |
|---|---|
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | frontend (demo) |
| **Surface** | `packages/demo/frontend/src/components/earn/SwapAction.tsx:387-453,608-612` (handleConfirmSwap + TransactionModal), `packages/demo/frontend/src/hooks/useSwap.ts:98-117` (double-submit guard), `packages/demo/frontend/src/components/earn/serverWalletOperations.ts:46-64` (executeSwap) |
| **Resolves findings** | F306, F307, F305, F303 |
| **Candidate existing issue** | #435 |
| **Blocked by** | (none) |

This is a **review-only, no-refactor** demo-frontend ticket. All four findings are low-risk fund-safety/consistency fixes that bring the swap action into parity with its sibling lend/withdraw and borrow flows. No architectural refactor of the swap surface is in scope.

## Problem

The demo swap action is the one fund-moving flow whose confirm path can submit against a quote the user no longer sees, can submit twice on a fast double-tap, and hides the on-chain revert reason when it fails. Each gap is individually low-blast-radius on a demo, but together they degrade the exact fund-safety signal a swap most needs: *was the amount I reviewed the amount I executed, and if it reverted, why?*

- A Review modal left open executes against a **stale quote** with no expiry check and no re-quote on Confirm. The frontend-wallet path then signs the literal stale calldata (min-out computed against an old price); the server-wallet path re-quotes server-side, so the displayed amounts diverge from what actually executes.
- The confirm guard is **async React state**, so two taps within one render tick can both pass and dispatch two swaps, spending the input token twice.
- The server-wallet execute path forwards **only a float `amountIn`** and no slippage/min-out, so the backend re-quotes independently and the reviewed quote's floor is never enforced — unlike the frontend-wallet path which executes the exact reviewed quote.
- When the swap reverts (slippage exceeded, stale quote, insufficient balance — all fund-safety events), the modal **swallows the reason** and shows only "Try again later.", while sibling lend/withdraw/borrow surface `ActionsError.shortMessage`.

## Findings

- **F306** (low) — `SwapAction.tsx:273-324,387-453`: the `SwapQuote` carries `quotedAt`/`expiresAt`/`deadline` (`packages/sdk/src/types/swap/base.ts:243,245,247`) but no frontend code reads them; `handleConfirmSwap` reuses the stored `quote` state with no recency check and no re-fetch on Confirm, so an open Review modal can submit an arbitrarily stale quote with no "expired, refresh" affordance.
- **F307** (low) — `useSwap.ts:98-117`: `handleSwap` guards reentry with `if (isSwapping) return` reading async React state, and the CTA is gated only by `disabled={isExecuting}` (`SwapAction.tsx:603`), so two confirms in one render tick can both reach `operations.executeSwap(quote)`; the sibling borrow path closes this exact window with a synchronous `executingRef` (`useBorrowTransaction.ts:47` declared, checked-and-set before the first await).
- **F305** (medium) — `SwapAction.tsx:443-451,608-612`: the failure branch of `handleConfirmSwap` only `console.error`s and renders `<TransactionModal>` with **no** `errorMessage`, so `TransactionModal.tsx:84` falls back to "Try again later."; sibling lend/withdraw (`Action.tsx`) and borrow (`useBorrowTransaction.ts` → `BorrowActionModals.tsx`) surface `ActionsError.shortMessage`.
- **F303** (medium) — `serverWalletOperations.ts:46-64`: `executeSwap(quote)` forwards only the float `quote.amountIn`, token addresses, `chainId`, and `provider` to `POST /swap/execute`, omitting `slippage`/`amountInRaw`/`amountOutMinRaw`; the backend re-quotes independently so the reviewed min-out is never enforced, unlike the frontend-wallet path (`frontendWalletOperations.ts` → `wallet.swap.execute(quote)`) which executes the exact reviewed quote. `actionsApi.executeSwap` already accepts a `slippage` field this path never populates.

## Root cause

Two seams, both "the swap flow drifted from its siblings":

1. **Quote-identity seam (F306, F307, F303).** The swap path treats the stored quote as a free-floating display artifact rather than the thing being executed. It never reconciles the displayed quote against time (F306 — no expiry gate), against a second concurrent submit (F307 — async-state guard instead of a synchronous ref), or against what the server actually executes (F303 — the server-wallet path discards the reviewed floor and re-quotes). The frontend-wallet path and the borrow flow already do the right thing in each case; swap is the inconsistent sibling.
2. **Error-surfacing seam (F305).** The swap confirm catch block never threads the caught error's message into the modal, while lend/withdraw/borrow all do. The one action most likely to revert for a fund-safety reason is the only one that hides the cause.

## Recommended approach

Review-only demo fixes that bring swap to parity with the existing siblings. No new abstractions, no swap-surface refactor — each change mirrors a pattern already present in the lend/withdraw or borrow code.

**F305 — surface the revert reason (medium, do first; smallest, highest fund-safety value).**
- In `handleConfirmSwap`'s catch, capture `err instanceof ActionsError ? err.shortMessage : <message>` into state and pass it as `errorMessage` to the swap's `<TransactionModal>` (`SwapAction.tsx:608-612`), mirroring `Action.tsx` (lend) and `useBorrowTransaction.ts` → `BorrowActionModals.tsx` (borrow). Additive, low-risk.

**F307 — synchronous reentry guard (low).**
- Add a `useRef` reentry guard in `useSwap.handleSwap`: set it synchronously at entry (before the first `await`), bail if already set, clear it in `finally`. Mirror `useBorrowTransaction.ts:47`'s `executingRef` exactly. Keep the existing `isSwapping` state for button disabling; the ref closes the same-tick window the state cannot.

**F306 — staleness gate (low).**
- Read the quote's `expiresAt` (and/or `quotedAt`) on Review open and before Confirm. If expired, block Confirm and prompt a re-quote (or auto-refresh); show a "quote may be stale" hint when the modal has been open beyond a short TTL. Additive UI gate, no signing-path change on the frontend-wallet side.

**F303 — enforce the reviewed floor on the server-wallet path (medium).**
- Forward the reviewed quote's `amountOutMinRaw` (or at minimum an explicit `slippage`, ideally derived from `amountInRaw`) into `POST /swap/execute` via the `slippage` field `actionsApi.executeSwap` already accepts, so the executed floor is bounded by what the user reviewed — matching the frontend-wallet path. This is the frontend half (populate the field the API already exposes); if the backend continues to re-quote, the backend should reject when its fresh min-out is below the client-supplied floor. The backend-side enforcement is **out of scope for this frontend ticket** and noted below.

## Affected files

- `packages/demo/frontend/src/components/earn/SwapAction.tsx:387-453` — `handleConfirmSwap` (F305 catch branch, F306 staleness gate)
- `packages/demo/frontend/src/components/earn/SwapAction.tsx:608-612` — swap `<TransactionModal>` (F305 `errorMessage` wiring)
- `packages/demo/frontend/src/hooks/useSwap.ts:98-117` — `handleSwap` (F307 synchronous ref guard)
- `packages/demo/frontend/src/components/earn/serverWalletOperations.ts:46-64` — `executeSwap` (F303 forward reviewed min-out/slippage)
- Reference (parity targets, not edited): `packages/demo/frontend/src/hooks/useBorrowTransaction.ts:47` (`executingRef`), `packages/demo/frontend/src/components/earn/Action.tsx` (lend error surfacing), `packages/demo/frontend/src/components/earn/TransactionModal.tsx:84` (fallback message), `packages/sdk/src/types/swap/base.ts:243,245,247` (`deadline`/`quotedAt`/`expiresAt`), `packages/demo/frontend/src/api/actionsApi.ts:242` (`slippage` field)

## Acceptance criteria / tests

- **F305:** A swap that reverts with an `ActionsError` (e.g. simulated slippage-exceeded) renders the modal with the error's `shortMessage`, not the generic "Try again later." fallback. Add/extend a test asserting the swap error path passes a non-empty `errorMessage` to `TransactionModal`.
- **F307:** Two synchronous calls to `handleSwap` within one render tick dispatch `operations.executeSwap` exactly once. Test by invoking the handler twice before the first promise resolves and asserting a single execute call.
- **F306:** Confirming against a quote whose `expiresAt` is in the past is blocked (Confirm disabled or routed to re-quote) and a staleness affordance is shown; a fresh quote confirms normally.
- **F303:** The server-wallet `executeSwap` request body includes the reviewed quote's `slippage` (or `amountOutMinRaw`-derived floor); assert the POST payload carries a non-default floor sourced from the reviewed quote, not omitted.
- General: existing swap tests and the demo frontend build/typecheck/lint stay green; no behavior change to the happy-path swap.

## Notes

- These are **demo-frontend** findings, not SDK findings. They are the frontend-layer twins of the SDK swap-encoding/slippage work; F303 and F306 reference issue **#435**. F305 and F307 have no existing issue. This ticket does **not** open a new SDK ticket.
- **RPC trust is out of scope.** The server-wallet re-quote divergence (F303) is about forwarding the reviewed floor, not about trusting the backend's RPC; integrators bring their own RPC, which is a documented assumption.
- **Backend enforcement of the client floor is a separate concern.** The frontend fix populates the `slippage`/min-out field the API already exposes; making `POST /swap/execute` *reject* a fresh quote below the client floor is backend work and is intentionally not bundled here.
- Sequence suggestion: F305 → F307 → F306 → F303, lowest-effort-highest-fund-safety first. F303 is the only one touching the request contract and benefits from being last.
- Sibling consistency note: F317 (lend/withdraw, in the ledger) is the third fund-moving sibling missing the same synchronous double-submit guard as F307; it is tracked separately but shares this ticket's `executingRef` parity pattern.
