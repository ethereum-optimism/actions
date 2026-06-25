# Source swap review modal min-received/slippage from the SDK quote, not a hardcoded literal

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Complexity** | 2 / 5 |
| **Domain** | frontend |
| **Surface** | `ReviewSwapModal.tsx:121,135-137` (the `slippage = 0.005` default and the `formatSwapAmount((parsedOut * (1 - slippage)).toFixed(6))` recompute), rendered without a `slippage` prop at `SwapAction.tsx:593-606` |
| **Resolves findings** | F302 |
| **Candidate existing issue** | #435 |
| **Blocked by** | (none) |

## Problem

The swap Review modal is the confirm screen a user reads before signing a swap. It shows "Minimum received" and "Max slippage", which are the user-facing representation of the on-chain slippage floor that protects the swap from settling for far less than quoted (MEV / sandwich / stale price). The on-chain floor that actually executes is the SDK quote's `amountOutMinRaw`, baked into the signed router calldata.

The modal does not read that floor. It recomputes "Minimum received" locally as `displayed amountOut * (1 - 0.005)` and renders "Max slippage" as `0.5%`, both derived from a hardcoded `0.005` literal that defaults in the modal's own prop signature (`ReviewSwapModal.tsx:121`) and is never passed by `SwapAction` (`SwapAction.tsx:593-606`). The authoritative `amountOutMin` / `amountOutMinRaw` / `slippage` the SDK carries on the `SwapQuote` (`sdk/src/types/swap/base.ts:216-219,240-241`) are discarded; the modal narrows the quote to `{ price, priceImpact }` (`ReviewSwapModal.tsx:25,104`).

Today the modal literal (`0.005`) and the SDK's resolved `defaultSlippage` (`0.005`) coincide, so the displayed figures match what executes by accident. They are wired from two independent sources in two files. Change either provider's `defaultSlippage`/`maxSlippage`, add a per-quote slippage, or let an SDK-side clamp/round adjust the floor, and the confirm screen overstates protection: it displays a min-received and a max-slippage that have no relationship to the bytes that execute on-chain. The approver signs against a number the SDK does not enforce. This is a misleading-protection / fund-safety display bug, not a fund-loss in the signing path itself (the calldata is built from the SDK's raw amounts, not from these formatters).

## Findings

- **F302** (`packages/demo/frontend/src/components/earn/ReviewSwapModal.tsx:121,135-137`) — the Review modal recomputes "Minimum received" (`135-137`) and "Max slippage" (`88-91`) from a hardcoded `0.005` literal (`121`) applied to the displayed `amountOut`, never reading the quote's authoritative `amountOutMin`/`amountOutMinRaw`/`slippage`; `SwapAction.tsx:593-606` never passes a `slippage` prop, so the modal always falls back to `0.5%`, and the displayed protection silently diverges from the executed on-chain floor if the configured slippage ever changes.

### Refinements folded into F302 (same hardcoded-`0.005` root, additional loci on the same modal)

- The "Max slippage" `DetailRow` (`ReviewSwapModal.tsx:88-91`) is driven by the same `slippage` prop that defaults to `0.005`; the displayed slippage % is an independent literal, not `quote.slippage`. Fixing min-received without this row leaves the slippage figure still fabricated.
- `formatSwapAmount` is typed `(amount: number)` (`utils/tokenDisplay.ts:110`) but `ReviewSwapModal.tsx:135-137` passes `(parsedOut * (1 - slippage)).toFixed(6)`, a string. It renders because the body does `String(amount).split('.')`, but the `amount === 0` zero-guard (`tokenDisplay.ts:114`) compares `===` against a number and never matches a string, so a zero min-received renders `"0.000000"` instead of `"0"`. Cosmetic, but the signature is violated and the zero-guard is dead on this path; passing the quote's `amountOutMin` as a `number` restores both.

## Root cause

`ReviewSwapModal` accepts the full SDK `SwapQuote` as `priceQuote`/`quote` but its prop type narrows it to `{ price: number; priceImpact: number }` (`ReviewSwapModal.tsx:25,104`), so `amountOutMin`/`amountOutMinRaw`/`slippage` are structurally unavailable to the component. With those fields discarded, the modal has nothing authoritative to render and falls back to recomputing the floor from a local `0.005` default that `SwapAction` never overrides. The displayed protection and the executed protection are two independent computations in two files that happen to use the same constant today.

## Recommended approach

Review-only, demo-layer (frontend) change. No architectural refactor: this widens what the modal reads from the quote it is already handed and deletes a local recompute. It does not touch the SDK signing path, does not change execution, and does not introduce new abstractions.

1. **Widen the modal's quote prop type** to carry the authoritative fields it already receives at runtime: `amountOutMin` (number, display), `amountOutMinRaw` (bigint, source of truth), and `slippage` (`sdk/src/types/swap/base.ts:216-219,240-241`). The runtime object passed at `SwapAction.tsx:597` (`priceQuote={quote}`) is already the full `SwapQuote`; only the local `{ price, priceImpact }` annotation hides these.

2. **Render "Minimum received" from `quote.amountOutMin`** (formatted via the output asset's decimals) instead of `formatSwapAmount((parsedOut * (1 - slippage)).toFixed(6))`. Pass it as a `number` so `formatSwapAmount`'s signature holds and the `=== 0` zero-guard is live again (folds in the `formatSwapAmount` string/zero-guard refinement). Prefer `amountOutMin` for display; `amountOutMinRaw` is the value the tx enforces and can be referenced if exact-decimal display is wanted.

3. **Render "Max slippage" from `quote.slippage`** (`ReviewSwapModal.tsx:88-91`) instead of the local `0.005`-defaulted prop, so the displayed slippage % is the same value the SDK applied to the quote.

4. **Remove the now-unused `slippage = 0.005` modal prop default and the local min-received recompute** once both rows read the quote. These become orphaned by this change (clean up only what this change orphans; leave unrelated modal code untouched).

Out of scope for this ticket (tracked separately, do not pull in here): the server-wallet re-quote parity gap (F303), quote staleness/expiry surfacing (F306), and the SDK-side `getQuote` slippage validation / encoder single-source-of-truth work (slippage-bounds-negative-minout). This ticket is purely the confirm-screen display sourcing its numbers from the quote it already holds.

## Affected files

- `packages/demo/frontend/src/components/earn/ReviewSwapModal.tsx:25,104` — widen the `priceQuote`/quote prop type to carry `amountOutMin`/`amountOutMinRaw`/`slippage`.
- `packages/demo/frontend/src/components/earn/ReviewSwapModal.tsx:135-137` — render "Minimum received" from `quote.amountOutMin` (passed as a number), delete the local `(parsedOut * (1 - slippage)).toFixed(6)` recompute.
- `packages/demo/frontend/src/components/earn/ReviewSwapModal.tsx:88-91,121` — render "Max slippage" from `quote.slippage`; remove the `slippage = 0.005` prop default.
- `packages/demo/frontend/src/components/earn/SwapAction.tsx:593-606` — confirm the full `quote` is passed (it is, as `priceQuote={quote}`); no `slippage` prop needed once the modal reads `quote.slippage`.
- `packages/demo/frontend/src/utils/tokenDisplay.ts:110-114` — no change required; passing a `number` per step 2 restores the typed signature and the `=== 0` zero-guard on this call path.

## Acceptance criteria / tests

- The Review modal's "Minimum received" equals the quote's `amountOutMin` (the value tied to `amountOutMinRaw` baked into the signed calldata), not `displayed amountOut * 0.995`.
- The Review modal's "Max slippage" equals `quote.slippage * 100`%, not a hardcoded `0.5%`.
- Repro check: with a quote carrying `slippage = 0.02` (2%) and a correspondingly lower `amountOutMin`, the modal renders "Max slippage 2.0%" and the matching min-received, not "0.5%" / `amountOut * 0.995`. (Verify against a quote whose slippage differs from the current default, since today the literal and the default both happen to be `0.005`.)
- A zero `amountOutMin` renders as `"0"` (not `"0.000000"`), confirming `formatSwapAmount` now receives a number and its zero-guard fires.
- No `0.005` literal remains in `ReviewSwapModal.tsx`; the modal derives every displayed protection figure from the passed quote.
- Demo frontend typecheck / lint / test / build pass.

## Notes

- This is the frontend-modal layer of the swap min-out cluster. The SDK-side root (slippage validation on the `getQuote` path, encoder single source of truth) is a separate in-scope ticket; this one assumes the SDK quote's `amountOutMin`/`amountOutMinRaw`/`slippage` are authoritative and merely sources the display from them.
- The `formatSwapAmount` string/zero-guard observation is informational and does not need a standalone change: it is fixed for free by passing `quote.amountOutMin` as a number, so it is folded in here rather than filed separately.
- The fix is subtractive (delete a recompute, widen a type) rather than additive logic, which keeps it review-only and low-risk for the demo surface.
- RPC trust and intent-guessing are out of scope; the SDK already computes the authoritative floor, so this is purely about the confirm screen reading the number the SDK produced instead of fabricating its own.
