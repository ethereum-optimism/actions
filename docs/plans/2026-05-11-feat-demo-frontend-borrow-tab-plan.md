---
title: "feat: demo frontend Borrow tab"
type: feat
status: active
date: 2026-05-11
origin: docs/brainstorms/2026-05-08-borrow-pr5-frontend-tab-brainstorm.md
---

# feat: demo frontend Borrow tab

## Re-Alignment with PR #3 / PR #4 (2026-05-11, after Phase 1)

After Phase 1 extractions landed, PR #3's brainstorm
(`docs/brainstorms/2026-05-08-borrow-pr3-sdk-borrow-provider-brainstorm.md`
on `origin/kevin/borrow-pr3`) and PR #4's brainstorm + plan
(`docs/brainstorms/2026-05-08-borrow-pr4-backend-endpoints-brainstorm.md`,
`docs/plans/2026-05-11-feat-borrow-pr4-backend-endpoints-plan.md` on
`origin/kevin/borrow-pr4`) were reviewed and their locked contracts adopted.
Implementation from Phase 2 onward uses the corrected shapes below; the
in-document type contracts in earlier sections are superseded where they
conflict.

### Adopted from PR #3 (locked)

1. **5 wallet methods, not 2**: `openPosition`, `closePosition`,
   `depositCollateral`, `withdrawCollateral`, `repay`. PR #5 stub implements
   all five, even if the demo UI only surfaces Borrow + Repay in V1.
2. **`AmountExact` / `AmountWithMax` discriminated unions** for all amount
   fields (per #379, applied to borrow from day one). Replaces my plan's
   `BorrowExecuteParams.amount: bigint`.
3. **`BorrowMarketId` is a tagged union** (`{ kind: 'morpho-blue'; marketId: Hex; chainId }`)
   forward-compat for Aave / Comet / Liquity / Euler. Replaces my plan's
   `{ address, chainId }` shape.
4. **`BorrowMarketPosition`** is the canonical position shape with
   `healthFactor: number` (1.0 = liquidation, Infinity if no debt),
   `liquidationPrice: bigint`, `borrowApy`, `liquidationBonus`, optional
   `ltv` / `maxLtv`. Replaces my plan's `BorrowPosition` shape.
5. **`safeCeilingLtv`** is precomputed by the SDK on `BorrowQuote` /
   `BorrowPrice`. PR #5 reads it; does not recompute.
6. **Quote / commit pattern** mirrors swap. `getPrice` is lightweight (no
   recipient binding); `getQuote` is recipient-bound with baked calldata.
   Wallet methods accept either params or `{ quote }`.
7. **`BorrowMarketConfig`**: `{ kind, marketId, chainId, name, collateralAsset, borrowAsset, borrowProvider, lendProvider, healthBufferPct? }`.
8. **Health buffer**: `BorrowSettings.healthBufferPct?` (default 0.05) +
   per-market override. PR #5's stub constant maps to
   `actions.borrow.settings.healthBufferPct` on backend wire-up.

### Adopted from PR #4 (locked)

9. **Endpoint surface** (1:1 with SDK methods):

   ```
   GET  /borrow/markets                                     public
   POST /borrow/price                                        public
   POST /borrow/quote                                        public
   GET  /wallet/borrow/:chainId/:marketId/position           auth
   POST /borrow/position/open                                auth
   POST /borrow/position/close                               auth
   POST /borrow/position/deposit-collateral                  auth
   POST /borrow/position/withdraw-collateral                 auth
   POST /borrow/position/repay                               auth
   ```

10. **Bigint serialization**: bigints go on the wire as decimal strings
    (existing `serializeBigInt` helper convention). PR #5's stub client
    parses strings back to bigint at the API boundary.
11. **Error envelope**: HTTP status + freeform message. No code field.
12. **Mutation bodies**: discriminated union (`params | { quote }`).

### What stays from my deepen-plan

- `useCollateralStatus` neutral selector hook (still right; reads
  `BorrowMarketPosition[]` from the borrow context, returns the position(s)
  that secure a given lend asset).
- `<BorrowHealthCard>` shared across three flows (Borrow / Repay / Lend
  Withdraw). Now consumes `healthFactor` decimal and `safeCeilingLtv` from
  the quote, plus computes the bar value as `currentLtv / safeCeilingLtv`.
- `<ReviewBorrowHealthModal>` with `flow` discriminator from day one.
- The canonical Aave-style HF decimal surfaces as the secondary label in
  the review modal (PR #3's `healthFactor` field powers this directly).
- All YAGNI cuts (no `<ActionCard>`, no `<LendPositionSelector>`, no
  TanStack mutation/query files in the stub phase).

### Notes for implementers

- The earlier "Type Contracts" code blocks in this plan reflect v1 shapes
  superseded by the above. Trust this Re-Alignment section over the body
  where they disagree.
- PR #5's stub `borrowApi.ts` exposes the 9-endpoint surface. The Class
  shape mirrors `ActionsApiClient`. When PR #4 lands, swap the in-memory
  resolution for `request<T>(...)` against the real backend.

## Enhancement Summary

**Deepened on:** 2026-05-11

This plan has been enriched with findings from 8 parallel reviewer +
research agents (simplicity, pattern-recognition, TypeScript, architecture,
performance, security, DeFi UX best practices, spec-flow). The body of
the plan reflects the highest-leverage changes inline; full findings and
resolutions are catalogued in "Deepen-Plan Findings & Resolutions" near
the end of this document.

### Key changes applied

- **Type safety**: amounts that touch settlement (`BorrowExecuteParams.amount`,
  `handleTransaction(amount)`) move from `number` to `bigint`; addresses
  to `viem` `Address`; chain IDs to `SupportedChainId`. Drops a real
  precision-loss class.
- **Single source of truth for Health bar**: `healthBarValue` removed
  from `BorrowPosition`; always computed via `computeHealthBarValue` so
  the eventual backend cannot paint a safe color over a liquidatable
  position.
- **Cross-tab dependency inversion**: a neutral
  `hooks/useCollateralStatus.ts` selector replaces direct
  `useBorrowProviderContext` reads from Lend's `Action.tsx`. Removes the
  Lend-depends-on-Borrow coupling.
- **Eager modal generalization**: `ReviewBorrowModal` ships with the
  `flow` discriminator (`'borrow' | 'repay' | 'withdraw'`) in Phase 3,
  not retrofitted in Phase 6.
- **Phase 1 snapshot tests mandatory**, not optional (refactor-risk gate).
- **Naming cleanup**: `BorrowOperations` methods drop the `Borrow`
  prefix; provider context uses `handleTransaction(mode, amount)` for
  Lend parity.
- **Edge cases tightened**: `computeProjectedLtv` returns a
  `'wouldLiquidate'` sentinel when `delta >= collateral`; positions
  removed from `borrowPositions` when repay reduces amount to 0;
  in-memory positions keyed by `walletAddress` and reset on wallet
  switch.
- **YAGNI cuts**: drops `<ActionCard>` and `<LendPositionSelector>` as
  separate files (inline at single consumer until a second appears);
  reuses `ActionsApiError` instead of a parallel error class; drops
  TanStack mutation/query scaffolding files during the stub phase (use
  `useState`/`useEffect`; add TanStack when PR #4 wires real fetches).
- **Phase collapse**: 7 phases → 5 (Borrow + Repay merged; Activity log +
  Lend integration merged).

### What deepen-plan validated as-is

- Safe-ceiling-mapped Health bar with 5% buffer (Morpho's published
  liquidation guidance recommends HF >= 1.05; our default matches).
- Two-tone projection bar (rare in production DeFi; demo-friendly
  innovation worth shipping).
- Single `isLoading` punt is acceptable; bug exists in Lend/Swap
  already; cross-tab refactor is a separate domain.
- Stub strategy genuinely is a one-file swap (verified against
  `ActionsApiClient` shape).

## Overview

Add a Borrow tab to `packages/demo/frontend/`, sibling to Lend and Swap.
The tab lets a user borrow against any lend position they hold, view
their borrow positions, and repay. The Lend tab gains projection
awareness when the lent asset is securing a borrow.

Frontend-only. No SDK changes, no backend, no contracts. PR #3 (SDK
borrow types) and PR #4 (backend borrow endpoints) have not landed; this
PR ships against a stubbed frontend borrow API shaped to mirror the
eventual contract so wiring is a one-file swap when those PRs land.

This plan is the execution counterpart to
`docs/brainstorms/2026-05-08-borrow-pr5-frontend-tab-brainstorm.md`,
which captured all UX-level decisions and the cross-PR escalation
to PR #3 (actions-config buffer value). Decisions referenced
in this plan with "(see brainstorm)" trace back to that document.

---

## Problem Frame

Users in the demo can lend and swap but cannot borrow. Demand for a
real DeFi-style borrow flow is on the Borrow track epic (#366), and
the GitHub issue (#392) specifies a borrow tab with health factor,
liquidation visibility, max-with-buffer, risky-position friction,
empty states, withdraw-warning, and activity log additions.

The prerequisite stack (PRs #3, #4) has not landed; the brainstorm
session chose to ship a stubbed frontend tab using existing demo
patterns rather than blocking PR #5 on those branches. The brainstorm
also reshaped the "Health" representation: 100% on the bar represents
the **safe ceiling** (LLTV minus a configurable buffer that lives in
actions config, owned by PR #3), not literal liquidation. The buffer
is the cross-PR escalation; PR #5 stubs a frontend constant and PR #3
swaps to a config read in one line when ready.

The strict design rule for this PR is **extract before duplicate**: the
Borrow tab is structurally a third instance of patterns already
established by Lend and Swap, and every new component must justify
its existence against an existing primitive that could be generalized
or shared instead.

---

## Requirements Trace

- R1. Visual + functional parity with the six screenshot states
  documented in the brainstorm (no collateral → market selected →
  asset modal → asset picked → amount entered → position created).
- R2. "Health" bar with safe-ceiling semantics, color tiers, info-icon
  popover, and two-tone projection on amount input.
- R3. Review modal as the friction gate for borrow, repay, and lend
  withdraw (when collateral pledged); modal grows a warning section
  when projected health lands in red or buffer zone.
- R4. Max button prefills the safe ceiling (= bar 100%). Buffer value
  read from `BORROW_HEALTH_BUFFER_PCT` stub constant.
- R5. Activity log gains `borrow`, `repay`, `getBorrowMarkets`,
  `getBorrowPosition` as distinct action types; cross-tab highlight
  extends via existing `isTabHighlighted`.
- R6. Lend tab withdraw mode shows the full `<BorrowHealthCard>` with
  live projection when the lent asset is securing a borrow.
- R7. New components grouped under `components/earn/borrow/`;
  extracted shared primitives stay flat under `components/earn/`.
- R8. Stubbed `api/borrowApi.ts` shaped to mirror the eventual PR #4
  backend so wire-up is a one-file swap.
- R9. Tests for projection math, borrow happy path, repay happy path,
  review-modal warning surface, and lend-withdraw-with-collateral flow.
- R10. Brainstorm decision migration: PR #3 escalation content moves
  from `handoff-pr5.md` into this plan + the brainstorm; `handoff-pr5.md`
  deleted as a standalone commit at brainstorm-doc landing time per
  handoff lifecycle.
- R11. One domain per PR per `AGENTS.md`: no SDK, no backend, no
  contract changes.

---

## Scope Boundaries

Out of scope (explicit):

- SDK borrow types (PR #3)
- Backend borrow endpoints (PR #4)
- Contract changes (PR #2 territory)
- Cross-tab refactor to a discriminated loading-stage state
  (`'idle' | 'preparing' | 'submitting' | 'confirming' | 'success' | 'error'`).
  The existing single `isLoading` flag in `Action.tsx:82` is reused
  by Borrow. Follow-up issue to be filed at PR landing.
- Out-of-liquidity per-asset visualization (demo markets,
  not modeled; brainstorm explicit decision).
- Hard-blocking dangerous borrows or withdraws (Review modal is
  informational, not gating).
- Liquidation price in USD (screenshots show LLTV %, not USD; we
  follow the screenshots).
- Shared `<MarketStateProvider>` over `<LendProviderContext>` +
  `<BorrowProviderContext>`. Defer; suspect needed but won't be
  visible until the duplication is concrete.
- Mainnet readiness; network selection beyond what Lend/Swap already
  expose.
- Slither / verification / fuzz tuning (other tracks).

---

## Context & Research

### Relevant Code and Patterns

- **Lend context shape to mirror**:
  `packages/demo/frontend/src/contexts/LendProviderContext.tsx:6-27` —
  `LendProviderContextValue` interface (markets, selectedMarket,
  marketPositions, isLoadingMarkets, handleMarketSelect, assetBalance,
  isLoadingBalance, isMintingAsset, depositedAmount, isLoadingPosition,
  isInitialLoad, handleMintAsset, handleTransaction). The new
  `BorrowProviderContextValue` mirrors this with borrow-specific keys
  (see Architecture below).
- **Operations interface to mirror**:
  `packages/demo/frontend/src/hooks/useLendProvider.ts:25-47` —
  `EarnOperations`. New `BorrowOperations` extends or sits alongside
  with `getBorrowMarkets`, `getBorrowPosition`, `openBorrow`,
  `repayBorrow`. For PR #5 the operations are stubbed.
- **API client pattern**:
  `packages/demo/frontend/src/api/actionsApi.ts:1-334` —
  `ActionsApiClient` class with generic `request<T>` (lines 34-64),
  custom `ActionsApiError` (lines 21-29), BigInt deserialization
  (lines 81-88, 98-109). New `borrowApi.ts` follows the same shape but
  resolves to in-memory mock data instead of fetching the backend.
- **Activity log type union**:
  `packages/demo/frontend/src/providers/ActivityLogProvider.tsx:19-28` —
  `ActivityEntry` carries `type: 'lend' | 'withdraw' | 'fund' | 'wallet' | 'swap'`.
  Extend to `'borrow' | 'repay'`.
- **Activity config table**:
  `packages/demo/frontend/src/constants/activityLogConfigs.ts:1-77` —
  `ACTIVITY_CONFIG` keyed by action string. Add entries for
  `borrow`, `repay`, `getBorrowMarkets`, `getBorrowPosition` with
  appropriate `type`, `description`, `apiMethod`, `tooltip`,
  `isReadOnly`.
- **Cross-tab highlight**:
  `packages/demo/frontend/src/components/earn/ActionTabs.tsx:16-43` —
  `LEND_ACTIONS`, `SWAP_ACTIONS`, `isTabHighlighted`. Add
  `BORROW_ACTIONS` and a third branch in `isTabHighlighted`.
- **Existing tab shell**:
  `packages/demo/frontend/src/components/earn/Earn.tsx:284-366` —
  `LendTab` function (MarketSelector + Action + LentBalance).
  `BorrowTab` mirrors this layout.
- **Form pattern reference**:
  `packages/demo/frontend/src/components/earn/Action.tsx:70-267` for
  simpler Lend-style flow; `packages/demo/frontend/src/components/earn/SwapAction.tsx:1-632`
  for the multi-modal flow `BorrowAction` is closer to (asset-select
  modal + review modal + tx modal).
- **Review modal pattern**:
  `packages/demo/frontend/src/components/earn/ReviewSwapModal.tsx:1-274` —
  private helpers `AmountRow`, `DetailRow`, `FormattedAmount`,
  `DownArrow` to be promoted to `components/earn/reviewModalParts.tsx`.
- **Positions table chrome**:
  `packages/demo/frontend/src/components/earn/LentBalance.tsx:103-588` —
  desktop table + mobile cards to be extracted to `<PositionsTable>`.
- **Mode toggle**:
  `packages/demo/frontend/src/components/earn/ModeToggle.tsx:1-56` —
  hardcoded `'lend' | 'withdraw'`. Generalize to accept
  `options: [{value, label}]`.
- **Amount input**:
  `packages/demo/frontend/src/components/earn/AmountInput.tsx:1-63` —
  static symbol chip. Extend with optional `onTokenClick` + `tokenLogo`.
- **Mutations**:
  `packages/demo/frontend/src/mutations/useLendPosition.ts:1-152` —
  TanStack mutation pattern with query invalidation and 2s retry.
  New `mutations/useBorrowPosition.ts` mirrors with
  `useOpenBorrow`, `useRepayBorrow`.
- **Queries**:
  `packages/demo/frontend/src/queries/useMarkets.ts:1-17` — staleTime
  60s, gcTime 5min. New `queries/useBorrowMarkets.ts` and
  `queries/useBorrowPosition.ts` mirror.
- **Utils**: `packages/demo/frontend/src/utils/tokenDisplay.ts`
  (`displaySymbol`, `formatUsd`, `formatSwapAmount`, `deriveUsdRates`)
  and `packages/demo/frontend/src/utils/assetUtils.ts` (`isEthSymbol`)
  reused as-is.
- **Test conventions**: `packages/demo/frontend/vitest.config.ts`,
  `packages/demo/frontend/src/test-setup.ts`. Vitest + jsdom +
  testing-library. Existing specs at `App.spec.tsx`,
  `api/actionsApi.spec.ts`, `components/earn/Action.spec.tsx`,
  `hooks/__tests__/useActivityLogging.spec.ts`.

### Brainstorm Decisions Carried Forward

(All from `docs/brainstorms/2026-05-08-borrow-pr5-frontend-tab-brainstorm.md`.)

| # | Decision | Brainstorm section |
|---|---|---|
| 1 | HF representation: % to liquidation, progress bar | Key Decisions / UX shape |
| 2 | Bar semantics: 100% = LLTV × (1 − buffer_pct) | Health bar semantics |
| 3 | Bar label "Health" + info-icon popover | Health bar semantics |
| 4 | Risk friction: inline color + Review modal as gate | Risk friction |
| 5 | Max button prefills safe ceiling | Max button |
| 6 | Per-stage loading: punted; reuse single `isLoading` | Per-stage loading state |
| 7 | `BORROW_ACTIONS` distinct namespace | Activity log |
| 8 | Lend-withdraw shows Health card when collateral pledged | Lend tab integration |
| 9 | Two-tone bar projection visualization | Health bar semantics |
| 10 | Out-of-liquidity skipped | Empty / blocked states |
| 11 | Buffer escalation logged for PR #3 | Decisions to Escalate to PR #3 |

### No Prior Solutions

`docs/solutions/` does not exist in this repo. No documented gotchas
or prior learnings to import.

---

## Architecture

### File Layout

```
packages/demo/frontend/src/
├── api/
│   ├── actionsApi.ts                       # unchanged
│   └── borrowApi.ts                        # NEW (mock)
├── components/earn/
│   ├── ActionTabs.tsx                      # MODIFY: add 'borrow' to ActionType + TABS + BORROW_ACTIONS
│   ├── Action.tsx                          # MODIFY: render <BorrowHealthCard> in withdraw mode when pledged (via useCollateralStatus hook)
│   ├── Action.spec.tsx                     # MODIFY: add withdraw-with-collateral test
│   ├── AmountInput.tsx                     # MODIFY: optional onTokenClick + tokenLogo
│   ├── ModeToggle.tsx                      # MODIFY: take options prop instead of hardcoded union
│   ├── PositionsTable.tsx                  # NEW (extracted from LentBalance.tsx table chrome)
│   ├── reviewModalParts.tsx                # NEW (promoted from ReviewSwapModal private helpers)
│   ├── ReviewSwapModal.tsx                 # MODIFY: import promoted helpers
│   ├── LentBalance.tsx                     # MODIFY: use <PositionsTable>
│   ├── Earn.tsx                            # MODIFY: add BorrowTab function + 'borrow' case in tab switch
│   └── borrow/                             # NEW SUBFOLDER (all borrow-internal)
│       ├── BorrowTab.tsx                   # inlines LendPositionSelector logic until a 2nd consumer appears
│       ├── BorrowAction.tsx
│       ├── BorrowAction.spec.tsx
│       ├── BorrowAssetModal.tsx
│       ├── BorrowHealthCard.tsx            # React.memo'd; stable numeric props
│       ├── BorrowHealthCard.spec.tsx
│       ├── BorrowPositions.tsx             # thin wrapper around <PositionsTable>
│       ├── ReviewBorrowHealthModal.tsx     # flow discriminator baked in from Phase 3
│       └── ReviewBorrowHealthModal.spec.tsx
│
│   # DROPPED vs. v1 of this plan:
│   # - ActionCard.tsx (would-be extraction): 1+1 consumers does not
│   #   justify a file; the outer chrome is shared as a single Tailwind
│   #   class constant or inlined; promote when a third consumer appears.
│   # - LendPositionSelector.tsx (would-be extraction): inlined in
│   #   BorrowTab; one consumer.
├── config/
│   ├── actions.ts                          # unchanged
│   └── borrow.ts                           # NEW (BORROW_HEALTH_BUFFER_PCT stub)
├── constants/
│   └── activityLogConfigs.ts               # MODIFY: add borrow/repay configs
├── contexts/
│   ├── LendProviderContext.tsx             # unchanged
│   └── BorrowProviderContext.tsx           # NEW
├── hooks/
│   ├── useLendProvider.ts                  # unchanged
│   ├── useBorrowProvider.ts                # NEW (implements BorrowOperations against the stub)
│   └── useCollateralStatus.ts              # NEW (neutral selector hook; Lend's Action.tsx imports this, NOT the borrow context)
├── providers/
│   └── ActivityLogProvider.tsx             # MODIFY: extend ActivityEntry.type AND ACTIVITY_CONFIG.type unions (BOTH must change; see Patterns finding)
│
│   # DROPPED vs. v1 of this plan (for the stub phase only):
│   # - mutations/useBorrowPosition.ts and queries/useBorrowMarkets.ts /
│   #   useBorrowPosition.ts. The stub uses useState + useEffect inside
│   #   useBorrowProvider; TanStack scaffolding is added when PR #4
│   #   wires the real backend. Defers ~3 files of YAGNI plumbing.
├── types/
│   ├── market.ts                           # MODIFY (or sibling): add BorrowPosition / BorrowMarket
│   └── borrow.ts                           # NEW (or in market.ts; decide at implementation time)
└── utils/
    ├── tokenDisplay.ts                     # unchanged
    ├── assetUtils.ts                       # unchanged
    └── borrowMath.ts                       # NEW (HF projection, color tier helpers)
    └── borrowMath.spec.ts                  # NEW
```

### Type Contracts

The mock borrow API and provider context expose a stable shape PR #4
will replace. Names and field types chosen to minimize churn when the
real backend lands.

```ts
// types/borrow.ts (or extend types/market.ts)
// Note: reuse existing `Asset` from types/market.ts where possible;
// a separate `BorrowAsset` is not introduced.

import type { Address } from 'viem'
import type { SupportedChainId } from '@eth-optimism/actions-sdk/react'
import type { Asset } from '@/types/market'

export interface BorrowMarketId {
  readonly address: Address
  readonly chainId: SupportedChainId
}

// `Ratio` is a brand to prevent passing 83 where 0.83 is expected.
// Single helper file `utils/ratio.ts` exports the brand + a `toRatio` assertion.
export type Ratio = number & { readonly __brand: 'Ratio' }

export interface BorrowMarketAsset {
  readonly asset: Asset
  readonly borrowApy: Ratio                 // e.g. 0.058 as a Ratio
  readonly liquidity: {
    readonly amount: bigint                 // raw base units
    readonly valueUsd: number               // pre-derived USD aggregate (display only)
  }
}

export interface BorrowMarket {
  readonly marketId: BorrowMarketId
  readonly marketName: string               // "Gauntlet USDC"
  readonly marketLogo: string
  readonly networkName: string              // "Base Sepolia"
  readonly networkLogo: string
  readonly collateralAsset: Asset           // the LENT asset used as collateral
  readonly collateralValueUsd: number       // display aggregate
  readonly lltv: Ratio                      // e.g. 0.833
  readonly bufferPct: Ratio                 // from BORROW_HEALTH_BUFFER_PCT
  readonly borrowableAssets: readonly BorrowMarketAsset[]
}

export interface BorrowPosition {
  readonly marketId: BorrowMarketId
  readonly borrowAsset: Asset
  readonly borrowedAmount: bigint           // raw base units
  readonly borrowedValueUsd: number         // display aggregate
  readonly borrowApy: Ratio
  readonly collateralAsset: Asset
  readonly collateralAmount: bigint         // raw base units
  readonly collateralValueUsd: number       // display aggregate
  readonly lltv: Ratio
  readonly bufferPct: Ratio
  readonly currentLtv: Ratio                // borrowedValueUsd / collateralValueUsd
  // NOTE: healthBarValue is intentionally NOT stored. It is always
  // computed via computeHealthBarValue() at the consumer (security:
  // do not trust a backend-supplied "safe" value).
}

export interface BorrowExecuteParams {
  readonly marketId: BorrowMarketId
  readonly borrowAsset: Asset
  readonly amount: bigint                   // raw base units; never `number`
}

export type BorrowTransactionReceipt =
  | { readonly status: 'success'; readonly transactionHash: string; readonly blockExplorerUrl?: string }
  | { readonly status: 'pending' }
```

```ts
// hooks/useBorrowProvider.ts
// BorrowOperations is the injectable dependency shape (what borrowApi
// implements). Method names drop the `Borrow` prefix; the interface
// itself is already namespaced. Mirrors EarnOperations style at
// hooks/useLendProvider.ts:25-47.

export interface BorrowOperations {
  getMarkets(): Promise<readonly BorrowMarket[]>
  getPositions(walletAddress: Address): Promise<readonly BorrowPosition[]>
  open(params: BorrowExecuteParams): Promise<BorrowTransactionReceipt>
  repay(params: BorrowExecuteParams): Promise<BorrowTransactionReceipt>
}
```

```ts
// contexts/BorrowProviderContext.tsx

export type BorrowMode = 'borrow' | 'repay'

export interface BorrowProviderContextValue {
  // Market data
  readonly markets: readonly BorrowMarket[]
  readonly selectedMarket: BorrowMarket | null
  readonly handleMarketSelect: (m: BorrowMarket) => void
  readonly isLoadingMarkets: boolean

  // Position data
  // NOTE: in-memory positions are keyed by walletAddress inside the
  // provider; switching wallets resets the array. PR #4 wires this to
  // the real backend with per-wallet response.
  readonly borrowPositions: readonly BorrowPosition[]
  readonly isLoadingPositions: boolean
  readonly isInitialLoad: boolean

  // Single transaction handler mirrors LendProviderContext.handleTransaction
  // at contexts/LendProviderContext.tsx:23-26. `amount` is bigint, never
  // a JS number. On full repay (amount equals current borrowedAmount),
  // the position is removed from borrowPositions and the matching
  // <BorrowHealthCard> unmounts on next render.
  readonly handleTransaction: (
    mode: BorrowMode,
    asset: Asset,
    amount: bigint,
  ) => Promise<BorrowTransactionReceipt>
}
```

```ts
// hooks/useCollateralStatus.ts
// Neutral selector that breaks the Lend -> Borrow context dependency.
// Lend's Action.tsx imports this hook, not the borrow context. The
// hook reads whichever provider is mounted and memoizes the result so
// referentially-stable returns survive re-renders.

import { useMemo } from 'react'
import { useBorrowProviderContext } from '@/contexts/BorrowProviderContext'
import type { Asset } from '@/types/market'
import type { BorrowPosition } from '@/types/borrow'

export interface CollateralStatus {
  /** All borrow positions secured by this asset. Empty if none. */
  readonly positions: readonly BorrowPosition[]
  /** Convenience flag: true iff `positions.length > 0`. */
  readonly isPledged: boolean
}

const EMPTY: CollateralStatus = { positions: [], isPledged: false }

export function useCollateralStatus(asset: Asset | null): CollateralStatus {
  // Note: returns the array (not just the first position) so the
  // multi-borrow case is supported at the type level. UI for now caps
  // at one borrow per collateral by disabling already-borrowed assets
  // in <BorrowAssetModal>; the array shape avoids a future refactor.
  const { borrowPositions, isInitialLoad } = useBorrowProviderContext()
  return useMemo<CollateralStatus>(() => {
    if (!asset || isInitialLoad) return EMPTY
    const positions = borrowPositions.filter(
      (p) =>
        p.collateralAsset.metadata.symbol === asset.metadata.symbol &&
        p.marketId.chainId === asset.chainId,
    )
    if (positions.length === 0) return EMPTY
    return { positions, isPledged: true }
  }, [asset, borrowPositions, isInitialLoad])
}
```

```ts
// utils/borrowMath.ts
// Pure functions. USD aggregates remain `number` because they are
// already lossy display values. Ratios use the `Ratio` brand from
// types/borrow.ts to prevent 83-vs-0.83 mistakes.

import type { Ratio } from '@/types/borrow'

export const computeSafeCeiling = (lltv: Ratio, bufferPct: Ratio): Ratio =>
  (lltv * (1 - bufferPct)) as Ratio

export const computeHealthBarValue = (
  currentLtv: Ratio,
  lltv: Ratio,
  bufferPct: Ratio,
): number => currentLtv / computeSafeCeiling(lltv, bufferPct)

// HealthTier separates state from presentation. The component maps
// tier -> color. `buffer` is a state, not a color.
export type HealthTier = 'safe' | 'caution' | 'danger' | 'buffer'

export const computeHealthTier = (barValue: number): HealthTier => {
  if (barValue > 1) return 'buffer'
  if (barValue >= 0.8) return 'danger'
  if (barValue >= 0.6) return 'caution'
  return 'safe'
}

// `Projection` is a sentinel union: callers must handle `wouldLiquidate`
// explicitly. This replaces the previous `Math.max(0.0001, denom)` guard
// that silently produced finite-but-astronomical projections.
export type Projection =
  | { readonly kind: 'projected'; readonly ltv: Ratio }
  | { readonly kind: 'wouldLiquidate' }

export type ProjectionAction =
  | { readonly kind: 'borrow'; readonly deltaValueUsd: number }
  | { readonly kind: 'repay'; readonly deltaValueUsd: number }
  | { readonly kind: 'withdrawCollateral'; readonly deltaValueUsd: number }

export const computeProjection = (
  current: { readonly borrowValueUsd: number; readonly collateralValueUsd: number },
  action: ProjectionAction,
): Projection => {
  switch (action.kind) {
    case 'borrow':
      return {
        kind: 'projected',
        ltv: ((current.borrowValueUsd + action.deltaValueUsd) /
          current.collateralValueUsd) as Ratio,
      }
    case 'repay':
      return {
        kind: 'projected',
        ltv: (Math.max(0, current.borrowValueUsd - action.deltaValueUsd) /
          current.collateralValueUsd) as Ratio,
      }
    case 'withdrawCollateral': {
      const nextCollateral =
        current.collateralValueUsd - action.deltaValueUsd
      if (nextCollateral <= 0) return { kind: 'wouldLiquidate' }
      return {
        kind: 'projected',
        ltv: (current.borrowValueUsd / nextCollateral) as Ratio,
      }
    }
  }
}

export const computeMaxBorrowSafe = (
  collateralValueUsd: number,
  lltv: Ratio,
  bufferPct: Ratio,
  currentBorrowValueUsd: number,
): number =>
  Math.max(
    0,
    collateralValueUsd * computeSafeCeiling(lltv, bufferPct) -
      currentBorrowValueUsd,
  )

// Invariant guard: refuse to compute if buffer is nonsensical.
// Called at provider init from BORROW_HEALTH_BUFFER_PCT.
export const assertBufferValid = (bufferPct: number): void => {
  if (bufferPct < 0 || bufferPct >= 1) {
    throw new Error(
      `BORROW_HEALTH_BUFFER_PCT must be in [0, 1); got ${bufferPct}`,
    )
  }
}
```

### State Flow (Borrow)

```
User opens Borrow tab
  → BorrowProviderContext loads markets + positions via useBorrowProvider
  → BorrowTab renders LendPositionSelector + BorrowAction + (BorrowPositions if any)
User picks lend position → setSelectedMarket
  → BorrowAction renders form, no asset chip yet
User clicks asset chip → BorrowAssetModal opens (markets[selected].borrowableAssets)
User picks asset → asset stored in BorrowAction local state, BorrowHealthCard mounts
User types amount → useMemo derives projectedLtv, barValue, color via borrowMath
  → BorrowHealthCard renders two-tone bar with current → projected
User clicks Max → input prefilled to computeMaxBorrowSafe(...)
User clicks Borrow → ReviewBorrowModal opens
  → modal shows AmountRow + DetailRows + BorrowHealthCard (projection)
  → if color === 'red' or 'buffer' → warning section + info popover
User confirms in modal → useOpenBorrow mutation fires
  → handleBorrow in context calls borrowApi (mock) → updates positions
  → TransactionModal shows loading → success toast
  → BorrowAssetModal-state reset; positions table updates
```

### State Flow (Lend withdraw with collateral)

```
User in Lend tab, withdraw mode
  → Action.tsx calls useCollateralStatus(asset) (neutral selector hook;
    NOT a direct borrow-context import)
  → if status.isPledged → <BorrowHealthCard> mounts; projection uses
    'withdrawCollateral' kind
  → bar updates live with two-tone current → projected as user types
  → if computeProjection returns kind='wouldLiquidate' → CTA disabled
    + inline "Withdrawing this much would liquidate your borrow" copy
User clicks Withdraw → <ReviewBorrowHealthModal flow='withdraw'> opens
  → modal renders same projection card + warning section if danger/buffer
User confirms → existing handleTransaction('withdraw', amount) fires
```

`<ReviewBorrowHealthModal>` ships in Phase 3 with the `flow` discriminator
(`'borrow' | 'repay' | 'withdraw'`) baked in from the start, even though
`'withdraw'` is unused until Phase 4. This avoids the two-rewrite path
the original plan accepted by deferring generalization to Phase 6.

### Stub Strategy

- `api/borrowApi.ts` is a class with the same interface shape
  `ActionsApiClient` has but resolves promises to hardcoded data.
  Markets and assets read from a `borrowMarkets` constant in
  `constants/borrowMarkets.ts` (NEW, not listed above; will be a
  small constant table). Positions are in-memory and seeded empty.
- `handleBorrow` mutates the in-memory positions array in
  `BorrowProviderContext` and returns a fake `transactionHash` after
  a setTimeout-based delay (mimics tx latency).
- When PR #4 lands, swap two files: `api/borrowApi.ts` to call
  `request<T>(...)` against real endpoints, and remove the in-memory
  seeding from `BorrowProviderContext`. The provider context's
  consumer surface stays identical.

### Activity Log Wiring

- `providers/ActivityLogProvider.tsx:19-28` — add `'borrow' | 'repay'`
  to the `type` union. No other shape change.
- `constants/activityLogConfigs.ts:1-77` — add four entries:

  ```ts
  borrow: {
    type: 'borrow',
    description: 'Borrowed an asset against collateral',
    apiMethod: 'borrowProvider.openBorrow',
    tooltip: 'Open a new borrow position',
    isReadOnly: false,
  },
  repay: {
    type: 'repay',
    description: 'Repaid borrowed amount',
    apiMethod: 'borrowProvider.repayBorrow',
    tooltip: 'Reduce an existing borrow position',
    isReadOnly: false,
  },
  getBorrowMarkets: {
    type: 'borrow',
    description: 'Fetched borrow markets',
    apiMethod: 'borrowProvider.getBorrowMarkets',
    tooltip: 'Read borrow market data',
    isReadOnly: true,
  },
  getBorrowPosition: {
    type: 'borrow',
    description: 'Fetched borrow positions',
    apiMethod: 'borrowProvider.getBorrowPositions',
    tooltip: 'Read borrow position data',
    isReadOnly: true,
  },
  ```

- `components/earn/ActionTabs.tsx` — add to TABS array, define
  `BORROW_ACTIONS = new Set(['borrow', 'repay', 'getBorrowMarkets', 'getBorrowPosition'])`,
  extend `isTabHighlighted` with a third branch:

  ```ts
  if (tabId === 'borrow' && activeTab !== 'borrow' && BORROW_ACTIONS.has(hoveredAction)) return true
  if (tabId !== 'borrow' && activeTab === 'borrow') {
    if (tabId === 'lend' && LEND_ACTIONS.has(hoveredAction)) return true
    if (tabId === 'swap' && SWAP_ACTIONS.has(hoveredAction)) return true
  }
  ```

---

## Implementation Phases

Each phase ends with a buildable, lintable, test-green tree. Small
commits inside each phase. Per the brainstorm-to-plan workflow, commits
are paced by feature memory rules (build → tests → lint:fix → commit
3-7 word message, never AI/Claude mention).

### Phase 1: Shared primitive extractions (no behavior change)

Goal: prepare the codebase so Phase 2+ can compose new tabs from
shared pieces without duplication. Lend tab UX must remain identical
through this phase.

Tasks:

1. **Generalize `ModeToggle.tsx`** to accept `options: Array<{value, label}>`
   instead of hardcoded `'lend' | 'withdraw'`. Update its single
   call-site in `Action.tsx:201` to pass the two options. Type the
   `mode` and `onModeChange` generically.
2. **Extract `<ActionCard>`** from `Action.tsx:186-265` (the outer
   `<div>` with border/radius/shadow + inner `<div>` with
   gap/padding wrapping the form contents). Move to
   `components/earn/ActionCard.tsx`. Replace usage in `Action.tsx`.
3. **Extract `<PositionsTable>`** from `LentBalance.tsx:135-583`.
   Component takes `columns`, `rows`, `mobileLayout` (render-prop or
   element). Move to `components/earn/PositionsTable.tsx`. Replace
   usage in `LentBalance.tsx` (the markets-with-deposits sort + mobile
   cards + desktop table); LentBalance becomes a thin wrapper that
   defines its column set.
4. **Promote `ReviewSwapModal` private helpers** (`AmountRow`,
   `DetailRow`, `FormattedAmount`, `DownArrow` from lines 14-107) into
   `components/earn/reviewModalParts.tsx`. Replace `ReviewSwapModal`'s
   inline definitions with imports.
5. **Extend `AmountInput.tsx`** with optional `onTokenClick?: () => void`
   and `tokenLogo?: string`. When `onTokenClick` is set, the chip
   becomes a button with the dropdown caret (matches screenshot state 2
   "Select token ⌄" and state 4 "ETH ⌄"). When unset, behaves as today.

Tests after this phase (gates, not optional):

- `components/earn/Action.spec.tsx` still passes (no behavior change)
- `components/earn/PositionsTable.spec.tsx` smoke test validating the
  extracted component renders columns + mobile layout
- **MANDATORY** snapshot tests on `Action.tsx`, `LentBalance.tsx`, and
  `ReviewSwapModal.tsx` to lock in the no-op refactor. Reviewer feedback
  flagged the pure-refactor risk on three live tabs before any new
  tests exist; snapshots are the cheapest regression catch and must be
  green before Phase 2 starts.

Commit pattern (~4 small commits):

- `extract ModeToggle options prop`
- `extract PositionsTable from LentBalance`
- `promote ReviewSwapModal review parts`
- `extend AmountInput token chip`

`<ActionCard>` extraction is dropped per deepen-plan simplicity review
(1+1 consumers does not justify a separate component file).

### Phase 2: Borrow tab scaffold + provider context + empty state

Goal: Borrow tab visible in the UI, switches in/out cleanly,
renders the no-collateral empty state. No borrow flow yet.

Tasks:

1. **`config/borrow.ts`**: export `BORROW_HEALTH_BUFFER_PCT = 0.05`
   with `// TODO(actions config): pull from SDK config when PR #3 lands`.
2. **`api/borrowApi.ts`**: stub class mirroring `ActionsApiClient`.
   In-memory positions, hardcoded markets list. Returns Promise<T>
   with setTimeout-based delays.
3. **`constants/borrowMarkets.ts`**: hardcoded list of one or two
   borrow markets (dUSDC collateral / ETH or AAVE borrow on Base
   Sepolia) shaped to mirror the eventual SDK response.
4. **`types/borrow.ts`** (or extend `types/market.ts`): types from
   the Architecture section.
5. **`hooks/useBorrowProvider.ts`**: returns `{ markets, positions,
   isLoadingMarkets, isLoadingPositions, openBorrow, repayBorrow }`.
   Uses TanStack queries + mutations against `borrowApi`. Mirrors
   `useLendProvider.ts` shape.
6. **`contexts/BorrowProviderContext.tsx`**: `BorrowProviderContextProvider`
   + `useBorrowProviderContext` hook. Exposes the
   `BorrowProviderContextValue` interface from Architecture.
   Implements `getBorrowPositionForCollateral` for cross-tab use.
7. **`mutations/useBorrowPosition.ts`**: `useOpenBorrow`,
   `useRepayBorrow` TanStack mutations. Mirror `useLendPosition.ts`.
8. **`queries/useBorrowMarkets.ts`, `queries/useBorrowPosition.ts`**:
   TanStack queries. Mirror `useMarkets.ts`.
9. **`components/earn/ActionTabs.tsx`**: add `'borrow'` to `ActionType`,
   add to TABS, no `BORROW_ACTIONS` yet (that comes in Phase 5).
10. **`components/earn/Earn.tsx`**: wrap `<BorrowProviderContextProvider>`
    in the provider stack (line 410 area, inside the existing nest).
    Add `'borrow'` case to the tab switch (lines 535-555). Render a
    new `<BorrowTab>` component (placeholder).
11. **`components/earn/borrow/BorrowTab.tsx`**: render the
    LendPositionSelector + an empty `<BorrowAction>` placeholder
    component + future-positions slot. For Phase 2, only the empty
    state is required:
    - If user has no lend positions: render the
      "To borrow you need to lend any asset to be used as collateral"
      banner (reuse `IlliquidMarketNotice.tsx` styling or a simple
      `<NoCollateralBanner>` thin wrapper if copy diverges).
    - Else: render the LendPositionSelector header + a disabled
      placeholder card.
12. **`components/earn/borrow/LendPositionSelector.tsx`**: wraps
    generic `<Dropdown<T>>` to render the user's lend positions
    (read from `useLendProviderContext()`) filtered to deposit > 0.
    Renders the dropdown chip with logo + asset + network + USD value
    matching screenshot state 2.

Tests after this phase:

- `BorrowProviderContext` initial state test (no positions, mock
  markets loaded)
- Smoke test: Borrow tab visible in the tab nav and clickable
- No-collateral banner renders when no lend positions exist

Commit pattern (~5-7 small commits).

### Phase 3: Health card + Borrow flow

Goal: complete borrow happy path against the stub.

Tasks:

1. **`utils/borrowMath.ts`**: all functions from Architecture section.
   Pure functions, fully unit-tested.
2. **`utils/borrowMath.spec.ts`**: exhaustive tests for
   `computeSafeCeiling`, `computeHealthBarValue`,
   `computeHealthColor`, `computeProjectedLtv` (each of the three
   `kind`s), `computeMaxBorrowSafe`. Edge cases: 0 collateral,
   0 borrow, projectedLtv > 1 → buffer color, etc.
3. **`components/earn/borrow/BorrowHealthCard.tsx`**: renders the
   two-tone bar (current solid + projected lighter overlay), numeric
   `47.5% → 65.0%`, "Liquidation at LLTV%", "Borrow APY",
   "Collateral" (logo + USD), "Buffer: X%" subtitle, info-icon
   tooltip explaining the safe-ceiling model. Reuses the APY tooltip
   pattern from `LentBalance.tsx:589-623` (or generalizes it into
   `components/earn/InfoTooltip.tsx` if it grows past one user;
   defer that extraction until needed).
4. **`components/earn/borrow/BorrowHealthCard.spec.tsx`**: renders
   correctly for green, yellow, red, buffer states. Two-tone bar
   shows current and projected. Tooltip opens on hover.
5. **`components/earn/borrow/BorrowAssetModal.tsx`**: modal-shell
   (reuse `Modal` + `ModalHeader`) wrapping a single-select asset
   table. Columns: Asset / Borrow APY / Liquidity. Click closes
   modal + calls `onSelect(asset)`.
6. **`components/earn/borrow/BorrowAction.tsx`**: composes
   `<ActionCard>` + `<ModeToggle options={[{value:'borrow',label:'Borrow'},{value:'repay',label:'Repay'}]}>`
   + `<AmountInput onTokenClick onTokenLogo>` + `<BorrowHealthCard>`
   + `<CtaButton>`. Borrow mode wired in this phase; repay shown but
   non-functional until Phase 4. Submit handler opens
   `<ReviewBorrowHealthModal>`.
7. **`components/earn/borrow/ReviewBorrowHealthModal.tsx`**: composes
   `<Modal>` + imports from `reviewModalParts.tsx` + `<BorrowHealthCard>`
   + warning section. **`flow` discriminator baked in from Phase 3**
   (`flow: 'borrow' | 'repay' | 'withdraw'`), even though `'withdraw'`
   is unused until Phase 4. This avoids the two-rewrite path the v1
   plan accepted by deferring generalization to Phase 6. Title, CTA
   copy, and warning copy adapt by `flow`.

   Also surfaces the canonical Aave-style HF decimal as a secondary
   label inside the modal (e.g. "HF: 1.42") so DeFi-savvy users
   recognize the relationship to the bar (per DeFi UX research
   finding; reconciles our innovation with industry conventions).
8. **Wire activity logging** for borrow tx events (uses
   `useActivityLogger`). Note: at this phase, activity types are
   logged but the cross-tab highlight set is not yet defined. That
   ships in Phase 5.

Tests after this phase:

- `borrowMath.spec.ts` 100% pass
- `BorrowHealthCard.spec.tsx` 4-color states + 2-tone projection
- `BorrowAction.spec.tsx`: happy-path borrow flow (select asset →
  enter amount → click borrow → review → confirm → success toast)

Commit pattern (~6-8 small commits).

### Phase 4: Repay flow + Positions table

Goal: repay flow functional + active positions visible after a
borrow.

Tasks:

1. **`components/earn/borrow/BorrowAction.tsx`** repay mode:
   - In repay mode, the `<AmountInput>` token chip shows the
     currently-borrowed asset (no token picker; can't repay other
     assets). Max prefills the borrowed amount.
   - HealthCard projection switches to `repay` kind (HF falls).
   - Review modal handles both modes (it inspects the kind).
2. **`components/earn/borrow/BorrowPositions.tsx`**: thin wrapper
   around `<PositionsTable>` with borrow column set: Asset / Amount /
   Borrow APY / Collateral (logo + USD) / Health (color-tier %).
   Reads from `useBorrowProviderContext().borrowPositions`.
3. **`components/earn/borrow/BorrowTab.tsx`**: integrate
   `<BorrowPositions>` below `<BorrowAction>`, conditional on
   positions length > 0.
4. **Tests**:
   - Extend `BorrowAction.spec.tsx` with repay happy path
   - `BorrowPositions.spec.tsx` smoke test (NOT strictly required per
     "bare minimum" but trivial to add; defer if testing budget tight)

Commit pattern (~3-4 small commits).

### Phase 5: Activity log integration + cross-tab highlighting

Goal: activity log emits and renders borrow/repay events with
cross-tab highlighting.

Tasks:

1. **`providers/ActivityLogProvider.tsx:19-28`**: extend
   `ActivityEntry.type` union with `'borrow' | 'repay'`.
2. **`constants/activityLogConfigs.ts`**: add four entries (see
   Architecture / Activity Log Wiring).
3. **`components/earn/ActionTabs.tsx`**: add
   `BORROW_ACTIONS = new Set(['borrow', 'repay', 'getBorrowMarkets', 'getBorrowPosition'])`;
   extend `isTabHighlighted` per Architecture section.
4. **`useBorrowProvider`**: wire `useActivityLogger` calls for read
   actions (`getBorrowMarkets`, `getBorrowPosition`) inside the
   TanStack query callbacks, matching how `useLendProvider` logs its
   reads.
5. **`BorrowAction.tsx`**: ensure write actions (`borrow`, `repay`)
   log via `useActivityLogger` on mutation success/error.

Tests:

- Extend `hooks/__tests__/useActivityLogging.spec.ts` to cover the
  four new action types.
- Smoke test: cross-tab highlight works when hovering a borrow log
  entry while on Lend tab.

Commit pattern (~2-3 small commits).

### Phase 6: Lend tab withdraw integration

Goal: when the lent asset is securing a borrow, Lend tab withdraw
mode shows `<BorrowHealthCard>` with live projection; review modal
handles the risky-withdraw case.

Tasks:

1. **`components/earn/Action.tsx`** withdraw mode:
   - Read `useBorrowProviderContext().getBorrowPositionForCollateral(asset)`.
   - If a borrow position exists, mount `<BorrowHealthCard>` between
     the input and CTA. Project with `kind: 'withdrawCollateral'`,
     `delta = (typed amount × asset USD rate)`.
   - Replace the existing withdraw submit (`onTransaction('withdraw',
     amount)`) with a Review modal opener (the same review modal used
     by Borrow). Confirm proceeds to the existing
     `onTransaction('withdraw', amount)`.
2. **`components/earn/borrow/ReviewBorrowModal.tsx`**:
   - Generalize to accept a `flow: 'borrow' | 'repay' | 'withdraw'`
     prop (or its `projection.kind`). Title and CTA copy adapt.
     Decision on rename to `<ReviewBorrowHealthModal>` is taken here
     (defer if the existing name is fine in practice).
   - When `flow === 'withdraw'` and health is in red/buffer, warning
     section reads:
     `"Withdrawing this amount moves your position into the buffer
     zone. If collateral price drops, you may be liquidated."`
3. **Tests**:
   - Extend `components/earn/Action.spec.tsx` to assert:
     - Withdraw with no borrow position: no Health card rendered
       (existing behavior unchanged)
     - Withdraw with borrow position: Health card rendered + bar
       projection updates on amount change
     - Withdraw at projected red HF: review modal shows warning

Commit pattern (~3-4 small commits).

### Phase 7: Tests, polish, brainstorm-cycle cleanup

Goal: ship-ready PR.

Tasks:

1. Re-run all tests, fix flakes.
2. Run `pnpm lint:fix` and `pnpm build` from the repo root.
3. Manual UX pass against the six screenshot states. Capture any
   pixel-level deviations in a small follow-up issue rather than
   over-investing in this PR.
4. **Standalone commit**: `git rm handoff-pr5.md` per its
   self-described lifecycle (handoff lines 8-10). The PR #3
   escalation content now lives in this plan + the brainstorm doc
   (no information lost).
5. **File follow-up issue**: cross-tab loading-state refactor.
   Suggested title: "refactor: discriminated loading-stage state in
   Action/SwapAction/BorrowAction." Body: link to brainstorm
   "Per-stage loading state" section.
6. **File follow-up issue**: `<MarketStateProvider>` to share
   wallet-clearing + query-key bookkeeping between Lend and Borrow
   provider contexts.

---

## System-Wide Impact

### Interaction Graph

A borrow action triggers:

- `BorrowAction.handleCtaClick` → `setReviewOpen(true)`
- ReviewBorrowModal.handleConfirm → `useOpenBorrow.mutate(params)`
- `useOpenBorrow` → `borrowApi.openBorrow(...)` (mock latency) →
  on success: updates in-memory positions; calls
  `queryClient.invalidateQueries({ queryKey: ['borrowPositions'] })`
  + `['tokenBalances']`; emits activity log entry (`borrow`)
- TanStack invalidation triggers refetch of `useBorrowPosition`
  query → context re-renders → `BorrowPositions` table updates →
  `getBorrowPositionForCollateral` now returns the new position →
  Lend tab's `Action.tsx` (if mounted) re-renders with `<BorrowHealthCard>`

A lend-tab withdraw against pledged collateral triggers (the
existing flow, augmented):

- `Action.handleCtaClick` (withdraw mode, pledged) →
  `setReviewOpen(true)` (NEW: opens review modal instead of going
  straight to tx)
- ReviewBorrowModal.handleConfirm →
  `onTransaction('withdraw', amount)` (UNCHANGED downstream call)
- Existing `useClosePosition` chain runs

### Error & Failure Propagation

- `borrowApi` mock methods may reject with a custom
  `BorrowApiError` (mirror `ActionsApiError`). When PR #4 swaps in
  real fetches, the same error class is reused; only the source of
  errors changes.
- `useOpenBorrow.onError` shows the `TransactionModal` in error
  state with the error short message (mirrors
  `useOpenPosition.onError` at `mutations/useLendPosition.ts:99-110`).
- Activity log records `status: 'error'` for failed mutations.
- Form-level validation (e.g. amount > 0, amount ≤ Max + buffer
  overflow) is local to `BorrowAction` and uses the same disabled-CTA
  pattern from `Action.tsx:109-115`.

### State Lifecycle Risks

- The mock in-memory positions array is **per-session** and resets on
  page reload. This is intentional for the stub. Document this in
  `BorrowProviderContext` comments so PR #4's real-backend integration
  doesn't preserve the in-memory seed behavior accidentally.
- A failed borrow does not leave the positions array dirty (mutation
  only mutates on success). Same as Lend.
- Cross-tab read (`getBorrowPositionForCollateral`) is a synchronous
  computed value over the positions array; no async race.

### API Surface Parity

- `BorrowOperations` interface keeps method names and parameter
  shapes consistent with `EarnOperations` style (object params, async
  returns). When PR #4 lands, the demo-frontend
  `useBorrowProvider` swaps `borrowApi` for a real fetcher in one
  edit; no consumer changes.
- The activity log surface (`type` union, action keys) is the source
  of truth for what gets cross-tab-highlighted. SDK and backend
  must be aware that PR #5 introduces these strings; included in the
  cross-PR escalation message for #3 / #4.

### Integration Test Scenarios

(Cross-layer scenarios that unit tests won't catch.)

1. **End-to-end borrow happy path** (vitest + testing-library):
   render `<Earn>` → click Borrow tab → select lend position →
   click asset chip → modal opens → select asset → enter amount →
   click Borrow → review modal opens with correct projection →
   confirm → toast appears → positions table renders new row.
2. **Cross-tab highlight**: render `<Earn>` on Lend tab → hover a
   borrow activity entry → assert Borrow tab gains the
   highlight-background style.
3. **Lend withdraw with collateral**: pre-seed a borrow position →
   navigate to Lend tab → withdraw mode → assert `<BorrowHealthCard>`
   renders → type amount near collateral total → assert bar projects
   to red → click Withdraw → assert review modal warning section
   renders.
4. **Stub-to-real swap simulation**: write a test that mocks
   `borrowApi` methods globally and asserts `useBorrowProvider`
   handles a backend failure gracefully (toast, activity log error
   entry).

---

## Acceptance Criteria

### Functional

- [ ] Borrow tab visible in `ActionTabs` between Swap and (nothing,
      end of list); clicking switches the tab content
- [ ] No-collateral state renders banner + disabled form per
      screenshot state 1
- [ ] Lend-position dropdown displays user's lend positions filtered
      to deposit > 0; chip matches screenshot state 2
- [ ] Borrow/Repay mode toggle works; uses generalized `<ModeToggle>`
- [ ] Token chip in `<AmountInput>` is clickable when in borrow mode
      and asset not yet picked; opens `<BorrowAssetModal>`
- [ ] `<BorrowAssetModal>` lists assets with Borrow APY + Liquidity
      columns per screenshot state 3; selection closes modal and
      sets asset
- [ ] `<BorrowHealthCard>` renders when asset selected; bar shows
      current → projected as user types; color tiers green/yellow/red/
      buffer apply per `computeHealthColor`
- [ ] Max button prefills `computeMaxBorrowSafe` value; user can type
      past it; bar clamps visually at 100% with "buffer zone" copy
- [ ] Info-icon tooltip on "Health" label explains the safe-ceiling
      model
- [ ] Clicking Borrow CTA opens `<ReviewBorrowModal>`; modal shows
      AmountRow + DetailRows + `<BorrowHealthCard>` projection
- [ ] When projected HF is red or buffer: modal warning section +
      info popover render
- [ ] Confirming modal fires `useOpenBorrow` mutation against the
      stub; success toast appears; `<BorrowPositions>` renders new row
- [ ] Repay mode prefills borrowed-asset token chip (no picker);
      Max = borrowed amount; HealthCard projection uses `'repay'` kind
- [ ] Active Positions table renders after first borrow with columns
      Asset / Amount / Borrow APY / Collateral / Health
- [ ] Activity log emits `borrow`, `repay`, `getBorrowMarkets`,
      `getBorrowPosition` entries; cross-tab highlight works in
      either direction
- [ ] Lend tab withdraw mode shows `<BorrowHealthCard>` when the
      lent asset is securing a borrow; bar projects with
      `'withdrawCollateral'` kind
- [ ] Lend tab withdraw goes through review modal when collateral
      is pledged; warning copy adapts to flow

#### Added by deepen-plan

- [ ] `BorrowExecuteParams.amount` and `handleTransaction(amount)` are
      `bigint`; no `number` for on-chain amounts anywhere in the call
      chain
- [ ] `BorrowPosition.healthBarValue` is NOT present in the type; the
      bar always recomputes from `currentLtv`, `lltv`, `bufferPct`
- [ ] `Action.tsx` (Lend) does NOT import from
      `@/contexts/BorrowProviderContext`; it imports
      `useCollateralStatus` from `@/hooks/useCollateralStatus`
- [ ] `<ReviewBorrowHealthModal>` accepts a `flow: 'borrow' | 'repay' | 'withdraw'`
      prop from Phase 3 (not retrofitted in Phase 6)
- [ ] Withdraw that would liquidate (computeProjection returns
      `'wouldLiquidate'`) disables the CTA and shows inline
      "would liquidate" copy; no astronomical bar value visible
- [ ] On full repay (`amount === borrowedAmount`), the position is
      removed from `borrowPositions` and the matching Health card
      unmounts
- [ ] On wallet switch (`walletAddress` change), in-memory
      `borrowPositions` reset (not just `queryClient.clear()`)
- [ ] `<ReviewBorrowHealthModal>` surfaces canonical Aave-style HF
      decimal as a secondary label beside the bar
- [ ] `<BorrowHealthCard>` subtitle clarifies "100% = safe ceiling
      (LLTV − buffer)"; info-icon tooltip mentions accruing interest

### Non-Functional

- [ ] No new external dependencies added
- [ ] Bundle size delta < 30 KB gzipped (rough estimate; verify with
      `pnpm build` output)
- [ ] Initial render of Borrow tab matches existing Lend tab tab-switch
      latency (no perceived delay from extra provider context)
- [ ] No regression in Lend tab UX through Phase 1 extractions
- [ ] No regression in Swap tab UX through Phase 1 extractions
- [ ] `<BorrowHealthCard>` wrapped in `React.memo` with stable
      numeric props
- [ ] `useCollateralStatus` return is referentially stable
      (memoized on `(asset, borrowPositions, isInitialLoad)`)
- [ ] `BorrowProviderContext` value object is memoized so identity
      is stable across renders that do not change relevant state

### Quality Gates

- [ ] `pnpm test` green
- [ ] `pnpm lint:fix` clean
- [ ] `pnpm build` succeeds
- [ ] `BORROW_HEALTH_BUFFER_PCT` stub has the
      `TODO(actions config): pull from SDK config when PR #3 lands`
      comment
- [ ] `borrowApi.ts` is the only file that PR #4 needs to rewrite to
      replace the stub
- [ ] No em-dashes in committed text (per `AGENTS.md`)
- [ ] Brainstorm-doc cross-check (Step 6 of plan workflow) confirms
      every brainstorm decision is reflected here
- [ ] `handoff-pr5.md` deleted in a standalone commit at brainstorm-
      doc landing time
- [ ] Phase 1 snapshot tests on `Action.tsx`, `LentBalance.tsx`,
      `ReviewSwapModal.tsx` are green before Phase 2 starts
- [ ] Activity log entries contain NO signatures, private keys, or
      unredacted wallet addresses

---

## Success Metrics

- The demo's Borrow tab is dogfoodable end-to-end against the stub
  by an internal user with no awareness of PR #4 status
- PR #4 wiring (when it lands) is a single-file edit
  (`api/borrowApi.ts`) plus the `BORROW_HEALTH_BUFFER_PCT` swap
- Activity log shows borrow/repay events alongside lend/swap with
  cross-tab highlight
- Zero new bug reports during PR #5 internal review related to
  Lend or Swap regressions (Phase 1 extraction risk)

---

## Dependencies & Risks

### Dependencies

- None blocking. PR #5 is fully self-contained behind the stub.
  `BORROW_HEALTH_BUFFER_PCT` swap is a follow-up after PR #3.
  `borrowApi.ts` swap is a follow-up after PR #4.

### Risks

1. **Phase 1 extraction regressions in Lend tab.**
   Mitigation: extractions are pure refactors with no UX change;
   existing `Action.spec.tsx`, `LentBalance.tsx` rendering, and
   `ReviewSwapModal.tsx` integration covered by tests at each step.
   Run `pnpm test` after each extraction commit; snapshot tests
   added for the refactored chrome.
2. **Stub data shape drift from eventual PR #4 contract.**
   Mitigation: the type contracts in this plan (BorrowMarket,
   BorrowPosition, BorrowOperations) are the contract PR #4 must
   match; documented in this plan and the cross-PR escalation
   section of the brainstorm. PR #4's reviewer is expected to
   reconcile any drift.
3. **Buffer config landing late / different shape from stub.**
   Mitigation: the stub is a single constant with a one-line swap
   path. Risk is low; the cross-PR escalation gives PR #3 the data
   they need to design the actions-config field.
4. **Cross-tab highlight conflicts.**
   `BORROW_ACTIONS` chose distinct names (`getBorrowMarkets`,
   `getBorrowPosition`) precisely to avoid this. Verified during
   Phase 5 testing.
5. **`<BorrowHealthCard>` rendering in three contexts** (Borrow,
   Repay, Lend Withdraw) may diverge if not driven by a single
   projection prop.
   Mitigation: the `computeProjectedLtv(current, action)` function
   is the single math entry point; component takes `{current,
   projected}` numbers, not flow-specific props. Three call sites,
   one render path.

---

## Open Questions (resolved here, not deferred)

All four brainstorm open questions are resolved in this plan:

| Brainstorm question | Resolution |
|---|---|
| Test coverage scope | Math unit tests + happy-path component tests for each flow + extended `Action.spec.tsx`; skip exhaustive edge cases per "bare minimum testing." Detailed in Phase 1-6. |
| File / dir layout | `components/earn/borrow/` subfolder for new borrow-internal files; extracted shared primitives flat under `components/earn/`. |
| Shared parent context | Not in PR #5; deferred to a follow-up issue (Phase 7 deliverable). |
| Withdraw warning copy | Generic Health card visual + info-icon tooltip is the message. Review modal warning copy stays informational ("Withdrawing this amount moves your position into the buffer zone."), not prescriptive. |

---

## Risk Mitigation: Brainstorm Coverage Cross-Check

Re-reading the brainstorm doc to confirm nothing dropped:

- [x] "What We're Building" → reflected in Overview
- [x] "Why This Approach" → reflected in Problem Frame
- [x] "Key Decisions" 11 items → tabulated in Brainstorm Decisions
      Carried Forward
- [x] Health bar semantics formula → in Architecture / utils/borrowMath
- [x] Component Reuse Map → mapped to file layout + phase tasks
- [x] Decisions to Escalate to PR #3 → preserved in the brainstorm
      and referenced from this plan; will move out of `handoff-pr5.md`
      at brainstorm-doc landing
- [x] Out of Scope (explicit) → captured in Scope Boundaries
- [x] Open questions → all four resolved above

---

## Cross-PR Coordination

- **Rebase strategy**: PR #5 stacks on `kevin/borrow-pr4`. Per the
  handoff (lines 116-125), rebase on `origin/kevin/borrow-pr4`
  before any work; rebase (not merge) on each new PR #4 push.
- **PR #4 wiring trigger**: when PR #4 lands, open a follow-up PR
  on PR #5's branch (or a stacked PR #5.1) to swap `borrowApi.ts`
  from stub to real `request<T>(...)`. The swap should not require
  consumer changes.
- **PR #3 escalation**: the buffer config decision is captured in
  the brainstorm doc's "Decisions to Escalate to PR #3" section.
  Forward verbatim to PR #3 author. Until PR #3 lands, the
  `BORROW_HEALTH_BUFFER_PCT` constant in `config/borrow.ts` is the
  single source of truth.
- **PR #6 dependency**: PR #6 polishes PR #5. Push PR #5 branch
  regularly so PR #6 can rebase cheaply.

---

## Deepen-Plan Findings & Resolutions

Catalogue of findings from the 8 parallel reviewer + research agents
run on 2026-05-11. Each finding lists the source agent, the issue, and
the resolution applied to this plan (or the deliberate non-action with
rationale).

### Type safety and on-chain precision

| Finding | Source | Resolution |
|---|---|---|
| `amount: number` for `BorrowExecuteParams` is an IEEE-754 precision-loss footgun for any non-trivial token amount. The plan uses `string` for `liquidity.amount`, `borrowedAmount`, `collateralAmount` but drops to `number` at the API boundary, defeating the point. | Security, Kieran TS | **Applied.** Type contracts changed: `BorrowExecuteParams.amount: bigint`, `borrowedAmount: bigint`, `collateralAmount: bigint`, `liquidity.amount: bigint`. `handleTransaction(mode, asset, amount: bigint)`. USD aggregates stay `number` (display only). |
| Plain `string` for addresses; plain `number` for chain IDs. The existing codebase uses `viem` `Address` and `SupportedChainId` from `@eth-optimism/actions-sdk/react`. | Kieran TS, Patterns | **Applied.** `BorrowMarketId.address: Address`, `chainId: SupportedChainId`. Matches `LendMarketId` usage at `useLendProvider.ts:111-112`. |
| Ratios like `lltv`, `bufferPct`, `currentLtv` as unbranded `number` invite callers passing 83 instead of 0.83. | Kieran TS | **Applied.** Introduced `Ratio` brand in `types/borrow.ts` with `toRatio()` helper. All ratio-shaped fields typed as `Ratio`. |
| `BorrowTransactionReceipt` has all fields optional, so a successful receipt has no required `transactionHash`. | Kieran TS | **Applied.** Discriminated union: `{ status: 'success'; transactionHash: string; blockExplorerUrl?: string } \| { status: 'pending' }`. |
| Missing `readonly` modifiers on interface fields. | Kieran TS | **Applied.** All `BorrowMarket`, `BorrowPosition`, `BorrowMarketAsset`, `BorrowMarketId` fields marked `readonly`; arrays marked `readonly readonly[]`. Sets a stronger precedent than the existing Lend types. |

### Single source of truth for Health

| Finding | Source | Resolution |
|---|---|---|
| `BorrowPosition.healthBarValue` precomputed and stored: if PR #4 backend ships a compromised or buggy value, frontend would paint a safe color over a liquidatable position. Also violates single-source-of-truth and duplicates derived state. | Security, Kieran TS, Simplicity | **Applied.** Field removed from `BorrowPosition` entirely. `<BorrowHealthCard>` always computes via `computeHealthBarValue(currentLtv, lltv, bufferPct)`. Documented in the type contract. |
| `computeProjectedLtv` uses `Math.max(0.0001, denom)` for `withdrawCollateral` divide-by-zero guard; silently produces astronomical-but-finite LTVs that render as buffer-zone instead of "would liquidate". | Security, Spec flow, Kieran TS | **Applied.** Renamed `computeProjectedLtv` to `computeProjection`, returning a `Projection` sentinel union: `{ kind: 'projected'; ltv: Ratio } \| { kind: 'wouldLiquidate' }`. Withdraw mode disables CTA + shows inline "would liquidate" copy when sentinel returns. |
| No invariant assertion on the buffer constant; a misconfigured `BORROW_HEALTH_BUFFER_PCT` would silently let Max prefill past the safe ceiling. | Security | **Applied.** `assertBufferValid(bufferPct)` invariant in `borrowMath.ts`, called at provider init. Throws if `bufferPct < 0 \|\| bufferPct >= 1`. |
| `HealthColor` mixes domain state (`buffer` = past safe ceiling) with presentation. | Kieran TS | **Applied.** Renamed to `HealthTier = 'safe' \| 'caution' \| 'danger' \| 'buffer'`. Component maps tier to color, not the math layer. |

### Cross-tab dependency direction

| Finding | Source | Resolution |
|---|---|---|
| `Action.tsx` (Lend domain) importing `useBorrowProviderContext` inverts the natural layering. When `<MarketStateProvider>` eventually lands this gets ripped out. | Architecture | **Applied.** Introduced `hooks/useCollateralStatus.ts` as a neutral selector hook. Lend's `Action.tsx` imports `useCollateralStatus(asset)`; the hook reads whatever provider is mounted and memoizes the result so referentially-stable returns survive re-renders. |
| `getBorrowPositionForCollateral` returning `BorrowPosition \| null` forecloses multi-borrow per collateral. Type-level limitation hides a design decision. | Spec flow | **Applied.** `useCollateralStatus` returns `{ positions: readonly BorrowPosition[]; isPledged: boolean }`. Type supports multi-borrow at the type level. UI for PR #5 still caps at one-borrow-per-lend by disabling already-borrowed assets in `<BorrowAssetModal>` (so the visible behavior matches the brainstorm), but the array shape avoids a future refactor. |
| Cross-tab read returns positions during `isInitialLoad`, which means a fast user could click Lend withdraw before borrow positions resolve and see no warning. | Security | **Applied.** `useCollateralStatus` returns `EMPTY` when `isInitialLoad` is true. Reviewers should treat absence as "not yet known" rather than "no borrow". |
| Symbol-matching for collateral status is undocumented (symbol? symbol+chainId? address?). Same-symbol-different-chain collateral could silently miss the warning. | Security | **Applied.** `useCollateralStatus` matches on `(symbol, chainId)` tuple. Documented inline. |

### Phase ordering and modal generalization

| Finding | Source | Resolution |
|---|---|---|
| Phase 1 snapshot tests on Lend/Swap chrome are marked optional, but the refactor risk on three live tabs warrants a mandatory gate. | Architecture | **Applied.** Phase 1 tests section now reads "(gates, not optional)" and explicitly requires snapshot tests on `Action.tsx`, `LentBalance.tsx`, `ReviewSwapModal.tsx`. |
| Deferring `ReviewBorrowModal` flow generalization to Phase 6 causes two rewrites (Phase 3 borrow-only → Phase 4 repay → Phase 6 withdraw). | Architecture | **Applied.** `<ReviewBorrowHealthModal>` ships in Phase 3 with the `flow: 'borrow' \| 'repay' \| 'withdraw'` discriminator baked in from the start, even though `'withdraw'` is unused until Phase 4. |
| Phases 3+4 are one feature (Borrow + Repay share `BorrowAction`); 5+6 are wiring touch-ups; 7 is housekeeping. 7 phases collapses cleanly to ~5. | Simplicity | **Applied as intent, deferred as renumbering.** The phase numbering in Implementation Phases is kept for traceability against earlier conversation. Implementers should treat the work as five logical clusters: P1 extractions, P2 scaffold + empty, P3 Health card + Borrow + Repay + Positions table, P4 activity log + Lend integration, P5 tests + polish + cleanup. |
| `<MarketStateProvider>` deferral will calcify because nothing breaks. | Architecture | **Partially applied.** Phase 7 follow-up issue is retained. Additionally: extract `MarketProviderState<T>` generic *type* now (not the provider) so the two contexts can be type-checked for drift in PR reviews. Captured here as a one-line implementation note for Phase 2. |

### Pattern consistency with existing codebase

| Finding | Source | Resolution |
|---|---|---|
| `handleBorrow` / `handleRepay` diverge from Lend's `handleTransaction(mode, amount)` shape. | Patterns | **Applied.** `BorrowProviderContextValue.handleTransaction(mode: BorrowMode, asset, amount: bigint)`. Mirrors `LendProviderContext.handleTransaction` at `contexts/LendProviderContext.tsx:23-26`. |
| `BorrowOperations` methods carry redundant `Borrow` prefix when the interface itself is already namespaced (`borrowOperations.getBorrowMarkets()` reads worse than `borrowOperations.getMarkets()`). | Kieran TS, Patterns | **Applied.** Methods renamed to `getMarkets`, `getPositions`, `open`, `repay`. |
| `BorrowOperations` was conflated with the consumer-facing context return shape. `EarnOperations` is the *injectable dependency*, not the return shape. | Patterns | **Applied.** `BorrowOperations` is the injectable shape (what `borrowApi` implements). The consumer-facing surface is `BorrowProviderContextValue`. |
| Both `ActivityEntry.type` union (in `providers/ActivityLogProvider.tsx:19-21`) AND `ACTIVITY_CONFIG.type` union (in `constants/activityLogConfigs.ts:2`) need extension. Plan only mentioned the former. | Patterns | **Applied.** File Layout now annotates `ActivityLogProvider.tsx` MODIFY note to mention both unions. |
| Existing convention: `withdraw` has its own `type`, not `type: 'lend'`. So `repay` should likely get its own `type: 'repay'`, not collapse under `type: 'borrow'`. | Patterns | **Applied.** Activity Log Wiring section now uses `type: 'repay'` for the `repay` config entry. |
| Singular vs plural inconsistency: existing keys are `getMarket` / `getPosition` (singular); plan introduced `getBorrowMarkets` (plural). | Patterns | **Documented but not applied.** Existing `getMarket` listing call is singular-named-for-plural-return; matching that means new keys would be `getBorrowMarket`. Decision: keep `getBorrowMarkets` / `getBorrowPosition` (plural for the list call; singular for the position) to reduce ambiguity for new contributors. Documented divergence here. |
| `mutations/useBorrowPosition.ts` plan said "mirror Lend" but didn't enumerate `['tokenBalances']` invalidation + 2s retry from `mutations/useLendPosition.ts:76-149`. | Patterns | **Moot — file dropped.** Stub phase uses `useState`/`useEffect`. When PR #4 wires TanStack, the mutation must invalidate `['tokenBalances']` and use 2s retry to match Lend; documented for that follow-up. |
| `queries/useBorrowMarkets.ts` should use `enabled: isReady()` gate from `queries/useMarkets.ts:13`. | Patterns | **Moot — file dropped.** Same as above; documented for the PR #4 follow-up. |
| Plan doesn't reference `utils/blockExplorer.ts:getBlockExplorerUrl` (used by `useLendPosition.ts:59`) but borrow receipts include `blockExplorerUrl`. | Patterns | **Applied as note.** Implementers must use the existing util when populating `BorrowTransactionReceipt.blockExplorerUrl`. |

### Performance

| Finding | Source | Resolution |
|---|---|---|
| `<BorrowHealthCard>` mounted in three places; per-keystroke re-renders cascade. | Performance | **Applied.** `<BorrowHealthCard>` wrapped in `React.memo` with stable numeric props (`current`, `projected`, `tier`). Local `amount` state stays leaf-scoped. Acceptance criterion added. |
| `getBorrowPositionForCollateral` unmemoized would recreate position object every render in Lend Withdraw, cascading through `<BorrowHealthCard>`. | Performance | **Applied.** `useCollateralStatus` uses `useMemo` keyed on `(asset, borrowPositions, isInitialLoad)`. Reference stability guaranteed. |
| Context value mutations re-render every consumer. | Performance | **Applied as note.** Implementation guidance: split read-heavy `markets`/`positions` value from action callbacks; memoize the context value object so identity is stable across renders that don't change the relevant state. |
| Stale-closure hazard: `handleTransaction` closing over `positions` and mutating directly. | Performance | **Applied as note.** Implementation guidance: positions array updates must use functional `setPositions(prev => ...)`; never mutate. |
| Activity log entries fire on every refetch; the log subscription re-renders the tab tree. | Performance | **Documented for follow-up.** `getBorrowMarkets`/`getBorrowPosition` should log only on state transitions (success/error), not on each refetch. Implementer note added. |
| TanStack staleTime should NOT be tightened from the existing 60s; manual invalidation on mutation already covers freshness. | Performance | **Confirmed.** No change. |
| Bundle budget: do not pull in chart or date libs for the two-tone bar. | Performance | **Confirmed.** Plan already says no new dependencies (line `## Acceptance Criteria / Non-Functional`). Implementers: build the bar as two divs with CSS `width: %`. |

### Security and integrity

| Finding | Source | Resolution |
|---|---|---|
| Stub `borrowApi` has no auth/CORS/CSRF posture; when PR #4 swaps in real fetches, the `request<T>` call must inherit the same auth-injection hook `ActionsApiClient` uses (session token, wallet binding). | Security | **Applied as note.** PR #4 swap-in checklist updated: `borrowApi` constructor must accept the same auth-injection hook as `ActionsApiClient`; the activity log must not become an auth source. |
| Activity log metadata: future contributors could log raw signatures, private keys, or unredacted wallet addresses if not constrained. | Security | **Applied as ACQ.** Acceptance criterion: "activity log entries MUST NOT contain signatures, private keys, or unredacted wallet addresses." |
| Wallet switch wipes `queryClient` but in-memory positions live in `BorrowProviderContext` and survive. | Spec flow | **Applied.** `BorrowProviderContext` keys in-memory positions by `walletAddress`; resets on switch. Documented in the type contract. |

### Edge cases and state transitions

| Finding | Source | Resolution |
|---|---|---|
| Repay-full state transition unspecified: when borrowed amount reaches 0, does the position disappear? | Spec flow | **Applied.** Documented in `BorrowProviderContextValue.handleTransaction` JSDoc: on full repay, the position is removed from `borrowPositions` and `<BorrowHealthCard>` unmounts on next render. Acceptance criterion added. |
| Multi-borrow per collateral semantics undefined. | Spec flow | **Applied.** Capped at one-borrow-per-lend by asset modal disabling already-borrowed assets; `useCollateralStatus` returns an array shape to avoid future refactor. |
| Negative amounts / NaN / scientific notation past `Number()` coercion. | Spec flow | **Punted.** Existing input regex in `Action.tsx:130-134` already constrains to `^\d*\.?\d*$`; `BorrowAction` will mirror. Edge cases beyond that are follow-up. |
| Asset modal with 0-liquidity assets: column renders but plan says out-of-liquidity is skipped. | Spec flow | **Punted.** Demo markets are bootstrapped with liquidity; brainstorm explicit decision. If 0 ever appears, it renders as `0` with no special handling. |
| Tab switch mid-typing: `BorrowAction` local state survives or resets? | Spec flow | **Documented decision.** State resets on tab switch (component unmounts because `Earn.tsx` switch case re-mounts). Plan acceptance criterion now explicit: switching tabs and returning shows an empty form. If users complain, follow-up moves form state into the provider. |
| Activity log on stub failure path: `borrowApi` mock has no rejection mechanism, so integration scenario #4 can't test failure. | Spec flow | **Applied as note.** Stub `borrowApi` accepts an optional `simulateFailure: boolean` flag on its methods (or via a test-only side-channel) for integration tests. Implementation detail in Phase 3 task list. |

### DeFi UX research (best practices)

| Finding | Source | Resolution |
|---|---|---|
| Industry standard for borrow risk display: Aave-style HF decimals (1.5x, 2.0x). Our safe-ceiling-mapped bar is demo-friendly innovation, not industry standard. | Best practices | **Applied.** `<ReviewBorrowHealthModal>` surfaces a small secondary "HF: 1.42" label beside the bar so DeFi-savvy users recognize the relationship. Reconciles innovation with industry conventions. |
| Morpho's published guidance: HF >= 1.05 (5% buffer). Matches our default. | Best practices | **Confirmed.** No change. Cited in Sources. |
| Two-tone projection bars are rare in production DeFi (Aave/Morpho/Spark show current + projected as two numbers). Genuinely better than status quo. | Best practices | **Confirmed.** Keep as-is. |
| Live HF projection: client-side math is fast; no debounce required. | Best practices | **Confirmed.** Instant updates on input. |
| Microcopy near the bar should clarify "100% = safe ceiling, not liquidation" because the bar disagrees with industry convention. | Best practices | **Applied.** `<BorrowHealthCard>` includes a small subtitle "100% = safe ceiling (LLTV − buffer)". Tooltip elaborates. |
| Pitfalls to surface: borrowing exactly at Max LTV with no buffer (Morpho's warning); interest accrual moving HF silently; LTV vs LT gap confusion. | Best practices | **Applied as note.** Tooltip copy in `<BorrowHealthCard>` and `<ReviewBorrowHealthModal>` mentions: "HF assumes current borrow rate; accruing interest will move this over time." |

### Simplifications cut

| Finding | Source | Resolution |
|---|---|---|
| `<ActionCard>` extraction (would-be Phase 1 task): 1+1 consumers does not justify a separate component file. | Simplicity | **Applied (dropped).** File removed from layout; Phase 1 task list reduced from 5 to 4. |
| `<LendPositionSelector>` extraction: wraps generic `<Dropdown<T>>` with one consumer; inline in `BorrowTab` until a second consumer appears. | Simplicity | **Applied (dropped).** File removed from layout; logic inlined. |
| `<NoCollateralBanner>` vs `IlliquidMarketNotice` reuse decision: just render inline; zero new files. | Simplicity | **Applied.** Inline `<div>` in `BorrowTab.tsx` rather than a new component. |
| TanStack mutation/query file scaffolding for a stub that returns hardcoded data with `setTimeout`: YAGNI for a synchronous in-memory mock. | Simplicity | **Applied (dropped for stub phase).** `useState`/`useEffect` in `useBorrowProvider`. TanStack added when PR #4 wires real fetches. |
| `BorrowApiError` mirror class: reuse existing `ActionsApiError` until divergence is needed. | Simplicity | **Applied.** No new error class. `borrowApi` throws `ActionsApiError`. |
| `BorrowAsset` type duplicates existing `Asset`: reuse `Asset`. | Simplicity | **Applied.** Type contracts now import `Asset` from `@/types/market` instead of defining `BorrowAsset`. |
| Test scope creep: snapshot test "Optional" line; `BorrowPositions.spec.tsx` self-flagged "defer if testing budget tight"; integration scenario #4 tests code that doesn't exist. | Simplicity | **Partially applied.** Phase 1 snapshots became mandatory (Architecture overrides Simplicity here for refactor safety). `BorrowPositions.spec.tsx` dropped. Integration scenario #4 kept but rewritten as "verify `borrowApi` failure path triggers error toast + activity log error entry" using the in-stub `simulateFailure` flag. |
| `computeMaxBorrowSafe` is a single arithmetic line for one consumer; inline. | Simplicity | **Rejected.** Keep as a named function for testability and to centralize the "buffer in, buffer applied" intent. The cost of a small function file is negligible; the readability win at call sites is real. |

### What deepen-plan did NOT change

- The 11 brainstorm decisions stand.
- The single-`isLoading` punt is correct; follow-up issue is sufficient.
- The stub `api/borrowApi.ts` as a one-file swap target is genuinely
  achievable; reviewer architecture analysis confirmed.
- Two-tone projection bar is a genuine UX improvement over industry.
- 5% buffer default matches Morpho's published recommendation.

## Sources & References

### Origin

- **Brainstorm document**: [docs/brainstorms/2026-05-08-borrow-pr5-frontend-tab-brainstorm.md](../brainstorms/2026-05-08-borrow-pr5-frontend-tab-brainstorm.md) — Carried forward 11 locked decisions (HF representation, bar semantics, label, risk friction, Max button, per-stage loading punt, activity log namespace, Lend-withdraw integration, two-tone projection, out-of-liquidity skip, PR #3 escalation).

### Internal References

- `packages/demo/frontend/src/contexts/LendProviderContext.tsx:6-27` — context shape to mirror
- `packages/demo/frontend/src/hooks/useLendProvider.ts:25-47` — operations interface to mirror
- `packages/demo/frontend/src/api/actionsApi.ts:1-334` — API client pattern
- `packages/demo/frontend/src/providers/ActivityLogProvider.tsx:19-28` — activity entry type
- `packages/demo/frontend/src/constants/activityLogConfigs.ts:1-77` — activity config table
- `packages/demo/frontend/src/components/earn/ActionTabs.tsx:16-43` — cross-tab highlight pattern
- `packages/demo/frontend/src/components/earn/Earn.tsx:284-366` — `LendTab` to mirror
- `packages/demo/frontend/src/components/earn/Action.tsx:70-267` — Lend form pattern
- `packages/demo/frontend/src/components/earn/SwapAction.tsx:1-632` — closer template for `BorrowAction`
- `packages/demo/frontend/src/components/earn/ReviewSwapModal.tsx:1-274` — review modal pattern; private helpers to promote
- `packages/demo/frontend/src/components/earn/LentBalance.tsx:103-588` — positions table to extract
- `packages/demo/frontend/src/components/earn/ModeToggle.tsx:1-56` — to generalize
- `packages/demo/frontend/src/components/earn/AmountInput.tsx:1-63` — to extend
- `packages/demo/frontend/src/mutations/useLendPosition.ts:1-152` — mutation pattern
- `packages/demo/frontend/src/queries/useMarkets.ts:1-17` — query pattern
- `AGENTS.md` — "one domain per PR", no em-dashes
- `CONTRIBUTING.md` — engineering principles
- `handoff-pr5.md` — to be deleted at brainstorm-doc landing per its lines 8-10

### External References (added by deepen-plan)

- [Morpho: Collateral, LTV & Health](https://docs.morpho.org/build/borrow/concepts/ltv) — supports the safe-ceiling-mapped bar's relationship to LLTV
- [Morpho: Liquidation](https://docs.morpho.org/build/borrow/concepts/liquidation/) — Morpho's published HF >= 1.05 recommendation; matches our 5% buffer default
- [Morpho: Pre-Liquidation](https://docs.morpho.org/build/borrow/concepts/preliquidation/) — buffer-zone semantics precedent
- [Aave: Health Factor & Liquidations](https://aave.com/help/borrowing/liquidations) — industry-standard HF decimal display
- [Aave V3 Overview](https://aave.com/docs/aave-v3/overview)
- [Compound III: Collateral & Borrowing](https://docs.compound.finance/collateral-and-borrowing/)
- [Spark: Borrowing Assets](https://docs.spark.fi/user-guides/using-sparklend/borrowing-assets)
- [Jon Crabb: Improving DeFi loan UX](https://medium.com/@JonCrabb/how-to-improve-the-ux-of-defi-loans-2a6ddd99d321) — common DeFi borrow-UX pitfalls
- [Cyfrin: DeFi Liquidation Vulnerabilities](https://www.cyfrin.io/blog/defi-liquidation-vulnerabilities-and-mitigation-strategies)

### Related Work

- Issue [#392](https://github.com/ethereum-optimism/actions/issues/392) — PR #5 GitHub issue
- Issue [#366](https://github.com/ethereum-optimism/actions/issues/366) — parent epic
- Issue [#391](https://github.com/ethereum-optimism/actions/issues/391) — PR #4 backend
- Issue [#390](https://github.com/ethereum-optimism/actions/issues/390) — PR #3 SDK
- Issue [#389](https://github.com/ethereum-optimism/actions/issues/389) — PR #2 contracts
- `docs/brainstorms/2026-05-05-borrow-pr2-oracle-and-market-deploy-brainstorm.md` — sibling brainstorm style precedent
- `docs/plans/2026-05-06-001-feat-morpho-borrow-market-deploy-plan.md` — sibling plan style precedent
