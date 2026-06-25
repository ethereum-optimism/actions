# Align borrow CTA-gate preview params with the executed transaction

>  AUGMENT existing issue #427 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | frontend |
| **Surface** | `hooks/useBorrowQuotePreview.ts`, `hooks/useBorrowTransaction.ts`, `components/earn/borrow/BorrowAction.tsx`, `components/earn/borrow/BorrowActionModals.tsx` (the borrow CTA gate, the executed-tx dispatch, and the review modal) |
| **Resolves findings** | F310, F314, F315 |
| **Candidate existing issue** | #427 (augment) |
| **Blocked by** | (none) |

## Problem

Three places in the demo Borrow flow let the **params the user is gated/shown on diverge from the params the SDK actually executes**. None is a fund-loss (the SDK floors at outstanding debt, and the user-facing health card is driven by the local projection, not these previews), but each defeats the purpose of the gate/review it sits behind, so a user can pass a check or read a number that does not describe the transaction they are about to sign.

1. **Top-up borrow CTA gate validates a different (lower-LTV) borrow than executes.** The debounced `/borrow/quote` preview that gates the Confirm CTA pledges added collateral on the top-up path, while the executed `open` call pledges none. The "did the backend accept these params" gate therefore green-lights a borrow-with-added-collateral while the executed call adds debt against existing collateral only — a riskier (higher-LTV) borrow than the one the backend was asked to validate.

2. **Repay-full submits a fixed float instead of the SDK `{ max: true }` close, leaving dust.** The Max button deliberately captures the exact-debt string ("exact string avoids dust"), but a `parseFloat` and a `{ amount: amountNum }` dispatch discard it. Because debt accrues interest between quote display and on-chain execution, a fixed-float repay computed at review time is always slightly below the true outstanding debt at execution, so a user who chose "repay in full" cannot actually close the position and is left with residual dust debt. The SDK already exposes `{ max: true }` on `BorrowRepayParams.amount` for exactly this dust-free close; the demo never uses it.

3. **Review modal renders live, non-snapshotted health/amount.** The borrow review modal renders the LIVE `health`/`amount`/`amountUsd` recomputed every render, not a snapshot frozen when the user opened it. While the modal is open the in-flight preview can settle and the position/balance queries can refetch, mutating the projected LTV / health-factor / warning band after the user began reviewing — and the confirm dispatches the live `amountNum`, not what was shown.

This is fund-safety-adjacent (parity between what is gated/reviewed and what is signed) but contained: it is a demo surface, the visible health card uses the local stub-price projection, and there is no over-repay or fund loss. It is **review-only** — small low-risk parity fixes, no architectural refactor.

## Findings

- **F310** (`packages/demo/frontend/src/hooks/useBorrowQuotePreview.ts:50-64`) — On the top-up path (`currentCollUsd > 0`), the preview pledges `collateralAmount: { amountRaw: directCollateralSharesRaw }` (`:53-62`), but the executed transaction in `useBorrowTransaction.ts:88-97` sends NO `collateralAmount` for top-ups (the `...(!isTopUp && ... ? { collateralAmount } : {})` spread at `:91-95` evaluates to `{}` when `isTopUp` is true). `BorrowAction.tsx` consumes only `isPreviewLoading` from the preview (`:154`) and gates the Confirm CTA on `!isPreviewLoading` (`:236`, inside `canOpenReview`), so the gate validates a borrow-with-added-collateral while the executed `open` borrows against existing collateral only.
- **F314** (`packages/demo/frontend/src/hooks/useBorrowTransaction.ts:99-102`; `BorrowAction.tsx:147,183-187`; `useBorrowQuotePreview.ts:69`) — `handleMax` sets `amount` to `activePosition.borrowAmountFormatted` (the exact-debt string, comment "exact string avoids dust", `BorrowAction.tsx:181-186`), but `amountNum = parseFloat(amount) || 0` (`:151`) drops that precision, and both the executed repay (`useBorrowTransaction.ts:101` `{ amount: amountNum }`) and the preview (`useBorrowQuotePreview.ts:69` `{ amount: amountNum }`) submit a fixed float even when the user chose repay-in-full (`canRepayFull`, `BorrowAction.tsx:120`). The SDK's dust-free close — `{ max: true }` on `BorrowRepayParams.amount` (`packages/sdk/src/types/borrow/params.ts:62-70,79-80`, resolved at dispatch in `internalParams.ts:138` `if (isMaxAmount(amount)) return { max: true }`) — is never used, so a full repay computed at review time lands below the interest-accrued debt at execution and leaves residual dust (which then trips the `DEBT_DUST_THRESHOLD` / repay-gate at `BorrowAction.tsx:115-116`).
- **F315** (`packages/demo/frontend/src/components/earn/borrow/BorrowActionModals.tsx:78-90`; `BorrowAction.tsx:316,332-348`) — `BorrowActionModals` renders `ReviewBorrowHealthModal` with the live `health`/`amount`/`amountUsd`/`activeAsset` computed every render in `BorrowAction` (`:267-281`, `health` object; `:151` `amountUsd`), not a snapshot frozen at `setReviewModalOpen(true)` (`:242`). While the modal is open the debounced `useBorrowQuotePreview` can flip `isPreviewLoading` and `currentCollUsd`/`projectionCollateralUsd` can change if `borrowPositions`/`tokenBalances` refetch, mutating the projected LTV / health-factor / warning band after the user opened the review; the user cannot edit `amount` under the modal, so not directly exploitable, but the reviewed and confirmed projections are not guaranteed identical.

## Root cause

The borrow form builds the preview params, the executed params, and the review-modal props **in three independent places that were allowed to drift**, rather than from one shared description of "the transaction the user is committing to":

- **F310:** the preview's collateral-pledge logic (`useBorrowQuotePreview.ts:50-64`) and the executed call's collateral-pledge logic (`useBorrowTransaction.ts:91-95`) encode the top-up case oppositely — the preview pledges direct shares on top-up, the execution omits collateral on top-up. They were written to the same intent ("only the fresh-open path pledges the full balance") but landed inverted on the top-up branch, and nothing binds them together.
- **F314:** the Max button preserves an exact-debt *string* specifically to avoid dust, but the pipeline immediately collapses every amount to a *float* (`parseFloat` at `BorrowAction.tsx:147/151`) before dispatch, with no branch that recognizes "the user chose full repay" and routes it to the SDK's `{ max: true }` sentinel that already exists for this purpose. The float path is correct for partial repays and wrong for full repays, but the code has only the float path.
- **F315:** the review modal reads the same live, continuously-recomputed projection state the inline card reads, with no snapshot taken at open time, so anything that recomputes the projection (preview settling, query refetch) reaches into the open modal.

## Recommended approach

Demo/frontend surface, **review-only** — low-risk fund-safety/parity fixes, no architectural refactor. All three are SDK-consistency / display-vs-executed-parity fixes that respect the scope rules (the SDK already exposes `{ max: true }`; the executed params are already known at gate-build time): no intent-guessing, no broad refuse-to-sign, no RPC-trust assumptions.

1. **F310 — make the gating preview pledge what the executed call pledges.** In `useBorrowQuotePreview.ts`, on the top-up branch (`currentCollUsd > 0`) **omit `collateralAmount`** so the gated `/borrow/quote` reflects the no-collateral top-up borrow that `useBorrowTransaction.ts:88-97` actually sends. Equivalently, derive the preview's collateral param from the same `isTopUp`/`freshOpenCollateralRaw` logic the executed call uses so the two cannot diverge again. The fresh-open branch (`currentCollUsd === 0`) is already correct and stays.

2. **F314 — thread the SDK `{ max: true }` sentinel through the full-repay path.** When the user chose Max in repay mode (`canRepayFull` / `debtBalance >= outstandingDebt`, `BorrowAction.tsx:120,184`), dispatch `handleTransaction('repay', { marketId, amount: { max: true } })` instead of `{ amount: parseFloat(...) }`, so the SDK resolves the live full debt at dispatch and closes dust-free (`internalParams.ts:138`). Keep the existing float-amount path for partial repays only. Mirror the same sentinel into the repay preview in `useBorrowQuotePreview.ts:69` so the gate validates the same `{ max: true }` close that executes.

3. **F315 — snapshot the reviewed projection at open time.** Capture `{ amount, amountUsd, health }` into modal-local state at the moment `setReviewModalOpen(true)` fires (`BorrowAction.tsx:242`) and render/confirm `BorrowActionModals` against that frozen snapshot, so the projection the user reviewed is the projection they confirm, regardless of preview settling or query refetch underneath. The underlying stub-price source of the projection (`useBorrowProjection`) is a separate concern tracked by #482 (F312/F313) and is not changed here; this is only the lifecycle/snapshot fix.

This ticket does **not** retire the stub-price projection (#482) and does **not** change the SDK borrow params (the `{ max: true }` capability already exists and is unit-tested at `BorrowProvider.spec.ts:303-317`); it only wires the demo to use what the SDK already exposes and aligns the demo's gate/review params with its own executed call.

## Affected files

- `packages/demo/frontend/src/hooks/useBorrowQuotePreview.ts:50-64` — top-up branch pledges `collateralAmount` the executed call omits (F310); omit it / derive from the same `isTopUp` logic.
- `packages/demo/frontend/src/hooks/useBorrowQuotePreview.ts:69` — repay preview submits a fixed float; submit `{ max: true }` for full-repay so the gate matches execution (F314).
- `packages/demo/frontend/src/hooks/useBorrowTransaction.ts:88-97` — executed `open` collateral spread (`!isTopUp ? { collateralAmount } : {}`); the parity reference for F310.
- `packages/demo/frontend/src/hooks/useBorrowTransaction.ts:99-102` — executed `repay` dispatches `{ amount: amountNum }`; route full-repay to `{ amount: { max: true } }` (F314).
- `packages/demo/frontend/src/components/earn/borrow/BorrowAction.tsx:120,147,151,181-187` — `canRepayFull` / `parseFloat` / `handleMax` exact-debt-string handling; add the full-repay branch that emits the `{ max: true }` sentinel (F314).
- `packages/demo/frontend/src/components/earn/borrow/BorrowAction.tsx:236,242,267-281` — CTA gate `!isPreviewLoading` (F310 gate site); `setReviewModalOpen(true)` snapshot point and the live `health` object (F315).
- `packages/demo/frontend/src/components/earn/borrow/BorrowActionModals.tsx:78-90` — `ReviewBorrowHealthModal` rendered with live `amount`/`amountUsd`/`health`; render against the open-time snapshot (F315).
- `packages/sdk/src/types/borrow/params.ts:62-70,79-80` — reference only: `BorrowRepayParams.amount: AmountOrMax` and the `{ max: true }` sentinel the demo should use (F314); not changed.
- `packages/sdk/src/actions/borrow/core/internalParams.ts:138` — reference only: `isMaxAmount` resolves `{ max: true }` at dispatch (F314); not changed.

## Acceptance criteria / tests

- **F310:** With an existing borrow position (top-up path, `currentCollUsd > 0`) and freshly-added direct lend shares, the `/borrow/quote` params the preview sends carry NO `collateralAmount`, matching `useBorrowTransaction`'s top-up `open` call. A test asserts the preview's built params and the executed call's built params agree on the collateral field for both the fresh-open (`currentCollUsd === 0`, pledges shares) and top-up (`currentCollUsd > 0`, omits) branches.
- **F314:** When the user clicks Max in repay mode and `canRepayFull` holds, the dispatched repay params equal `{ marketId, amount: { max: true } }` (not `{ amount: <float> }`), and the repay preview submits the same `{ max: true }`. A partial repay (`!canRepayFull`) still dispatches `{ amount: <floored float> }`. A test asserts that after a full-repay the SDK path resolves to the live debt (no residual dust), distinct from the float path that lands below an interest-accrued debt.
- **F315:** Opening the review modal snapshots `{ amount, amountUsd, health }`; a preview settling or a `borrowPositions`/`tokenBalances` refetch while the modal is open does not change the LTV / health-factor / warning band rendered in the modal, and confirm dispatches the snapshotted amount. A test mutates the underlying projection while the modal is open and asserts the modal props are unchanged.
- Demo frontend `pnpm` typecheck / lint / test / build pass.

## Notes

- Augments **#427** (the borrow display-vs-executed cluster; F314 already points there). Treat F310, F314, F315 as one coherent parity pass over the borrow form: gate params, full-repay sentinel, and review snapshot all enforce "what is gated/shown equals what is signed."
- Review-only, no architectural refactor: the fixes are param-derivation alignment, threading an existing SDK sentinel, and a modal-open snapshot. No new abstraction and no change to the SDK borrow params or the stub-price source.
- The stub-price projection itself (`useBorrowProjection`, fail-open `$0`/`HF = Infinity` for unpriced assets) is tracked separately by **#482** (F311/F312/F313) and is out of scope here; F315 is the snapshot/lifecycle angle of the projection, not its pricing source.
- F310 is the collateral-param gate-vs-execute gap; F314 is the repay-amount gap; F315 is the modal-snapshot gap. They are distinct rows in the ledger and each has its own acceptance criterion above, but they share one surface and one fix PR.
- No fund-loss in any of the three: the SDK floors repay at outstanding debt (no over-repay), the visible health card uses the local projection rather than the diverging preview, and the user cannot edit the amount under the open modal. Severity is low because the harm is a defeated gate / a position that will not fully close / a reviewed number that can shift — parity defects, not value extraction.
- End-to-end coverage (real Privy/Turnkey/Dynamic creds + Anvil-simulated signing) is the single consolidated feature-test ticket built later, not here; this ticket's tests are demo-frontend unit/integration assertions on param parity and the modal snapshot.
- RPC trust and intent-guessing remain out of scope: every fix here enforces a parity the demo already has the data for (the executed params are known at gate-build time; the full-repay intent is known from `canRepayFull`; the reviewed projection is known at modal-open time).
