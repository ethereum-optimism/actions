---
date: 2026-05-08
topic: borrow-pr5-frontend-tab
related:
  - https://github.com/ethereum-optimism/actions/issues/392
  - https://github.com/ethereum-optimism/actions/issues/366
  - handoff-pr5.md (will be deleted at brainstorm-doc landing)
  - docs/brainstorms/2026-05-05-borrow-pr2-oracle-and-market-deploy-brainstorm.md
  - docs/plans/2026-05-06-001-feat-morpho-borrow-market-deploy-plan.md
---

# Borrow PR #5: demo frontend Borrow tab

## What We're Building

A new **Borrow tab** in `packages/demo/frontend/`, sibling to the existing
Lend and Swap tabs. The tab lets a user borrow against any lend position
they hold, view their borrow positions, and repay. The Lend tab also
gains projection awareness when the lent asset is securing a borrow.

Frontend-only work. No SDK changes, no backend, no contracts. PR #3 (SDK
borrow types) and PR #4 (backend borrow endpoints) have not landed; this
PR ships against a stubbed frontend borrow API that mirrors the eventual
contract closely enough that wiring up to the real backend is a one-file
swap when those PRs do land.

Six UI states drive the design (provided as screenshots in the brainstorm
session):

1. **No collateral** — banner "To borrow you need to lend any asset to be
   used as collateral", borrow form disabled, no token chip yet.
2. **Lend position selected, no asset picked** — Lend Position dropdown
   filled, "Select token" chip in the input, CTA disabled.
3. **Asset selector modal** — table of borrow assets (Asset / Borrow APY
   / Liquidity), single-select.
4. **Asset picked, amount = 0** — Health card now visible with bar at 0%
   and live "Liquidation at" / "Borrow APY" / "Collateral" stats; CTA
   active red but disabled at 0.
5. **Amount entered** — Health card updates live; bar shows projected
   value with two-tone before-after; CTA active.
6. **Position created** — input resets; "Active Positions" table appears
   below with columns Asset / Amount / Borrow APY / Collateral / Health.

## Why This Approach

The Lend and Swap tabs already establish all the primitives this work
needs: card chrome, mode toggle, amount input, market selector, modal
shell, transaction modal, activity log, cross-tab highlighting,
positions table. The Borrow tab is structurally a third instance of the
same shape, and the strict design rule for this PR is **extract before
duplicate**: every new component must either reuse an existing primitive
unchanged or generalize one in place.

The design also resolves a subtle representation issue. The screenshots
show "Health Factor" as a 0–100% bar that grows as risk grows; the GitHub
issue says "health factor as a decimal." These describe opposite numeric
directions. We keep the screenshot's percent bar (clearer for a demo
audience) but reframe what 100% means: it represents the **safe ceiling**
(LLTV minus a configurable buffer), not literal liquidation. The buffer
lives in actions config and is owned by PR #3; the frontend stubs a
constant in the meantime. This makes the buffer invisible-but-load-bearing
and gives the Max button a single, defensible meaning ("fill to bar
100%").

## Key Decisions

### UX shape

- **Tab order: Lend / Swap / Borrow.** Add `'borrow'` to
  `ActionType` in `components/earn/ActionTabs.tsx:4` and a third entry
  to `TABS`.

- **Borrow / Repay mode toggle inside the form.** Generalize
  `components/earn/ModeToggle.tsx` to take an `options: [{value, label}]`
  prop instead of hardcoding `'lend' | 'withdraw'`. Lend tab and Borrow
  tab both call it with their own pair.

- **"Select Lend Position" dropdown at the top.** Reuses the existing
  generic `<Dropdown<T>>` (the same primitive `MarketSelector.tsx`
  already wraps). Renders the user's lend positions filtered to those
  with deposit > 0; empty state shows the no-collateral banner.

- **Asset selector is a modal, not a dropdown.** Uses the existing
  `Modal` + `ModalHeader` shell. Table columns: Asset / Borrow APY /
  Liquidity. Single-select. Closes on selection.

- **Health card appears once an asset is selected.** Renders
  bar (0–100%, two-tone), "Liquidation at" (LLTV %), "Borrow APY",
  "Collateral" (logo + USD), and a small "Buffer: X%" subtitle. Not
  visible in state 1–3.

### Health bar semantics

```
LLTV (e.g. 83.3%)        : market constant, immutable
buffer_pct (e.g. 5%)     : actions config (PR #3); stubbed in PR #5
safe_ceiling = LLTV * (1 - buffer_pct)         (e.g. 78.3%)

bar value = (current_LTV / safe_ceiling) * 100
  bar   0%  : no debt
  bar 100%  : at safe ceiling (NOT yet liquidated)
  bar >100% : in buffer zone, between safe_ceiling and LLTV
```

- **Label: "Health"** (preserves the screenshot label) plus an info icon
  whose tooltip explains the safe-ceiling model. Tooltip pattern reuses
  the APY tooltip from `components/earn/LentBalance.tsx:589-623` (or a
  small generalization of it).
- **Color tiers** (relative to the safe ceiling, not LLTV):
  - 0–60% green
  - 60–80% yellow
  - 80–100% red
  - greater than 100% red plus "Position is in buffer zone" copy
- **Two-tone projection.** When the user types an amount, the bar
  shows the current value as a solid fill and the delta-to-projected as
  a lighter overlay. Numeric reads `47.5% → 65.0%` with a "from 47.5%"
  caption. Same component handles all three projection flows below.

### Risk friction

- **Inline color tier on the bar** is the primary visual cue. The CTA
  copy stays "Borrow"; we do not change CTA copy on red.
- **The Review modal is the friction gate.** Clicking the Borrow CTA
  always opens a review modal (mirrors `components/earn/ReviewSwapModal.tsx`),
  even for safe positions. When the projected health lands in the red or
  buffer zone, the modal grows a warning section with an info-icon popover
  that elaborates ("This position is X percentage points from the buffer
  zone; if collateral price drops Y%, your position will be liquidated.").
  No separate confirmation gate; the modal IS the gate.
- **The Review modal pattern extends to Lend-tab Withdraw** when the
  lent asset is securing a borrow (see Lend integration below) and to
  Repay (downward HF projection, generally good news, but still
  reviewed).

### Max button

- Prefills the **safe ceiling** (= bar 100%) in both Borrow input and
  Lend-Withdraw input (when collateral pledged). User can still type
  past Max manually to enter the buffer zone; the bar clamps visually
  at 100% and red-with-warning copy appears.
- Buffer source: a frontend constant `BORROW_HEALTH_BUFFER_PCT = 0.05`
  in `packages/demo/frontend/src/config/borrow.ts` with a
  `// TODO(actions config): pull from SDK config when PR #3 lands`
  marker. Single source of truth shared by `<BorrowHealthCard>`,
  `<BorrowAction>`, and the Lend-tab withdraw integration.

### Lend tab integration

- The Lend tab's withdraw mode grows the **full `<BorrowHealthCard>`**
  whenever the lent asset is currently securing a borrow. The card
  renders projected health for the typed withdraw amount (HF rises as
  withdraw amount rises): `projected_LTV = borrow_value / (collateral_value − delta)`.
  When no borrow uses this asset as collateral, the withdraw mode
  renders unchanged (no Health card).
- Submit on a withdraw that lands in the red/buffer zone goes through
  the Review modal with the same warning treatment as a risky borrow.
- This is a deliberate cross-tab edit and the strongest extraction case
  in the PR. The Health card now serves three flows:

  | Flow | Projection |
  |---|---|
  | Borrow → Borrow input | `(borrow_value + delta) / collateral_value` (HF rises) |
  | Borrow → Repay input | `(borrow_value − delta) / collateral_value` (HF falls) |
  | Lend → Withdraw (collateral pledged) | `borrow_value / (collateral_value − delta)` (HF rises) |

### Per-stage loading state

- **Punted.** Borrow uses the same single `isLoading` boolean and
  `'loading' | 'error'` modal as Lend (`components/earn/Action.tsx:82`,
  `components/earn/TransactionModal.tsx:6`). The known double-click
  and misleading-state issue called out in the handoff is documented
  here and tracked as a follow-up. Solving it requires a cross-tab
  refactor (Lend, Swap, Borrow) that does not belong in PR #5's scope.
- Follow-up issue to file: cross-tab refactor to a discriminated
  loading-stage state model
  (`'idle' | 'preparing' | 'submitting' | 'confirming' | 'success' | 'error'`).

### Activity log

- New action types: `BORROW_ACTIONS = new Set(['borrow', 'repay', 'getBorrowMarkets', 'getBorrowPosition'])`.
- Cross-tab highlighting extends naturally: the existing
  `isTabHighlighted` function in
  `components/earn/ActionTabs.tsx:24-43` gains a borrow branch.
- Distinct namespace from `LEND_ACTIONS` so a `getBorrowPosition` log
  entry highlights only the Borrow tab. The SDK is expected to expose
  separate `BorrowProvider.getMarkets()` / `BorrowProvider.getPosition()`
  calls; sharing names with Lend would be lying about which call ran.

### Empty / blocked states

- **No collateral** (state 1) — banner inside the Borrow tab pointing at
  Lend. Single string, no new component beyond a styled `<div>`.
- **No borrow position yet** (state 2 onward) — Active Positions table
  is hidden entirely until the user has at least one borrow.
- **Out-of-liquidity per asset** — explicitly out of scope. Demo
  markets are bootstrapped with sufficient liquidity and we are not
  modeling the depleted case for PR #5.

## Component Reuse Map

The following table is the brief for the plan phase. Every new
component file must justify its existence against this list.

### Reuse / extend (no new file)

| Existing | Strategy |
|---|---|
| `ActionTabs.tsx` | Add `'borrow'` to `ActionType`, add `BORROW_ACTIONS` set, extend `isTabHighlighted` |
| `Dropdown<T>` | Reuse as-is for "Select Lend Position" |
| `Modal`, `ModalContent`, `ModalHeader` | Reuse for Review modal and Asset-select modal |
| `IlliquidMarketNotice.tsx` | Reuse for the no-collateral banner with broader copy (or a tiny `<NoCollateralBanner>` thin wrapper if the copy diverges enough) |
| `useActivityHighlight`, `useActivityLogger` | Reuse, register the four new action types |
| `TransactionModal.tsx` | Reuse unchanged (the per-stage refactor is punted) |

### Generalize in place (no new file)

| Existing | Generalization |
|---|---|
| `ModeToggle.tsx` (`'lend' \| 'withdraw'`) | Take `options: [{value, label}]`. Both Lend and Borrow consume. |
| `AmountInput.tsx` (static symbol chip) | Add optional `onTokenClick` and `tokenLogo` props so the chip can be a clickable selector when needed. |

### Promote to shared (one new shared file)

| Source | Promote to |
|---|---|
| `ReviewSwapModal.tsx` private helpers (`AmountRow`, `DetailRow`, `FormattedAmount`, `DownArrow`) | `components/earn/reviewModalParts.tsx` (or `.ts`), consumed by `<ReviewSwapModal>` and new `<ReviewBorrowModal>` |
| `LentBalance.tsx` table chrome (header + mobile cards + desktop table layout) | `<PositionsTable columns rows mobileLayout>`, consumed by `LentBalance` and new `<BorrowPositions>` |
| `Action.tsx` outer card div | `<ActionCard>` shell consumed by `<Action>` and new `<BorrowAction>` |

### Truly new

| Component | Purpose |
|---|---|
| `<BorrowHealthCard>` | Two-tone bar + Liquidation/APY/Collateral/Buffer rows. Used in three flows (Borrow, Repay, Lend Withdraw with collateral). |
| `<BorrowAssetModal>` | Modal-shell + asset table. Single-select. |
| `<ReviewBorrowModal>` | Composes `Modal` + promoted review parts + `<BorrowHealthCard>` + warning section (when projected health is red). |
| `<BorrowAction>` | Form for Borrow / Repay modes. Sits on `<ActionCard>` shell. |
| `<BorrowPositions>` | Thin wrapper around extracted `<PositionsTable>` with borrow-specific columns. |
| `<BorrowTab>` | Top-level tab layout. Lend Position selector + `<BorrowAction>` + `<BorrowPositions>`. Mirrors the `LendTab` function in `Earn.tsx:284-366`. |
| `<BorrowProviderContext>` | Mirrors `LendProviderContext`. Owns positions, markets, mode handlers, refresh. |
| `useBorrowProvider` hook | Mirrors `useLendProvider`. Consumed by the context provider. |

### Stubbed (frontend-only, mirrors eventual SDK)

| Stub | Lives in | Replaced when |
|---|---|---|
| `borrowApi.ts` (mock fetch wrapper) | `packages/demo/frontend/src/api/borrowApi.ts` | PR #4 backend lands |
| `BORROW_HEALTH_BUFFER_PCT` constant | `packages/demo/frontend/src/config/borrow.ts` | PR #3 actions config lands |
| Mock borrow markets list (asset + APY + liquidity) | `packages/demo/frontend/src/api/borrowApi.ts` | PR #4 backend lands |
| Mock borrow position state (in-memory, per session) | `BorrowProviderContext` | PR #4 backend lands |

## Decisions to Escalate to PR #3

The "Health" bar's safe-ceiling semantics require a buffer value that
lives in actions config (PR #3 territory). Until PR #3 lands, PR #5
stubs a frontend constant. PR #3 must answer:

1. **Granularity.** Is `buffer_pct` per-market or global? Different
   markets may warrant different buffers (a stablecoin market might
   need less buffer than an ETH market).
2. **Default value.** Confirm 5% as the demo default. Fixed constant in
   actions config or variable per environment?
3. **Config shape and location.** Where does this live in actions
   config, and how does the demo read it? Options PR #3 may consider:
     - A field on `MarketInfo` (per-market, returned by `getMarkets()`)
     - A top-level actions-config field (global)
     - A separate `getBorrowSafetyConfig(market)` getter on
       `BorrowProvider`
   PR #5's stub is shaped to accept any of the three; the demo needs to
   know what to call.
4. **Units and sign.** Is `buffer_pct` a fraction (`0.05`) or a percent
   value (`5`)? PR #5 stubs as a fraction; PR #3 should match or PR #5
   will need a format adapter.
5. **Bar over 100% handling.** Should the demo allow positions in the
   buffer zone (LTV between `safe_ceiling` and `LLTV`)? PR #5's current
   plan: yes, with the bar pinned at 100% red and a "Position is in
   buffer zone" warning. If PR #3 wants the SDK to *prevent* such
   borrows (enforcing the buffer at the action level, not just in the
   UI), then PR #5's bar will never exceed 100% and the warning copy
   shifts.

UI contract that PR #3's config decision must enable:

- "Health" bar 100% maps to the safe ceiling (= LLTV × (1 − buffer))
- Max button prefills that same safe ceiling
- The buffer value is readable from a single call site so PR #5's stub
  can be replaced with one edit

## Out of Scope (Explicit)

- SDK changes (PR #3)
- Backend endpoints (PR #4)
- Contract changes (PR #2 territory)
- Per-stage loading-state refactor across Lend / Swap / Borrow
  (follow-up)
- Out-of-liquidity per-asset visualization (demo markets, not modeled)
- Hard-blocking dangerous borrows or withdraws (Review modal is
  informational, not gating)
- Liquidation price in USD (the screenshots show LLTV %, not USD; we
  follow the screenshots)
- Mainnet readiness, network selection beyond what Lend/Swap already
  expose

## Open Questions (deferred to plan phase or beyond)

- Test coverage scope: which user flows beyond the happy path warrant
  dedicated tests, given the "bare minimum testing" guidance for the
  demo frontend?
- File / directory layout: keep new components flat under
  `components/earn/` or introduce a `components/earn/borrow/` sub-folder?
  (The lean from extracting `<PositionsTable>` and `<ActionCard>`
  suggests a small refactor of folder layout is reasonable; defer to
  plan.)
- Should `<BorrowProviderContext>` and `<LendProviderContext>` share a
  parent `<MarketStateProvider>` to deduplicate wallet-clearing /
  refresh logic? Suspect yes; defer to plan.
- Withdraw warning copy when partial withdraws are safe but full
  withdraw is not. Need wording from product before final plan; the
  Review modal's warning section is the surface.

## Resolved Questions

(All major UX questions resolved during the brainstorm session. Items
above marked "deferred" are plan-phase concerns, not unresolved
brainstorm decisions.)

## Migration Note

This document supersedes the cross-PR escalation section currently in
`handoff-pr5.md`. When PR #5 is ready to commit the brainstorm doc, the
companion commit deletes `handoff-pr5.md` per its self-described
lifecycle (handoff lines 8-10). The PR #3 escalation content is now
canonical here in the "Decisions to Escalate to PR #3" section.
