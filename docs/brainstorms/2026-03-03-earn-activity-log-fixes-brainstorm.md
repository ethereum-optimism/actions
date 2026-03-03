---
date: 2026-03-03
topic: earn-activity-log-fixes
---

# Earn Activity Log: Fix Duplicates & Reduce Fragility

## What We're Building

Fix duplicate log entries in the earn demo's Activity Log and refactor the logging architecture to prevent future regressions. The demo supports both frontend and server wallets — all changes must live in the shared hook/query layer to avoid duplicating logic.

### Bugs to Fix

1. **Double `getPosition` on load**: `useLendProvider` batch-fetches all positions directly (populating local `marketPositions` state) but doesn't seed the TanStack Query cache. So `useMarketPosition` also fires for the selected market — redundant fetch + duplicate log.

2. **`getPosition` on market selection change**: Same root cause. Selecting a different market changes `useMarketPosition`'s queryKey, which cache-misses and refetches. Positions are already loaded — no fetch needed.

3. **Double `getBalance` + `getPosition` after lend/withdraw**: `useLendPosition.onSuccess` invalidates queries immediately AND after a 2s `setTimeout`. Each invalidation triggers a refetch that logs. Result: 2x log entries per query type per transaction.

4. **Structural fragility**: Logging lives inside `queryFn`, so every TanStack Query refetch (background, invalidation, stale) creates a log entry. No deduplication for read-only operations.

## Why This Approach

### Approach considered: Remove `useMarketPosition`, read from state
- Simpler but abandons TanStack Query's cache management
- Kevin prefers keeping TanStack Query as the backbone

### Approach considered: Keep logging in queryFn with dedup
- Adds complexity (time-based dedup thresholds, key tracking)
- Still fragile — any new refetch trigger could surprise

### Chosen approach: Seed cache + log at call site + conditional delayed refetch

**Rationale**: Keeps TanStack Query patterns intact, moves logging to intentional call sites so background refetches are silent, and only does the delayed refetch when the first one returned stale data.

## Key Decisions

- **Seed TanStack cache from batch fetch**: After `useLendProvider` batch-fetches all positions on mount, seed the `['position', address, chainId]` query cache for each market. This way `useMarketPosition` finds cached data on market switch — no redundant fetch.

- **Log at call site, not in queryFn**: Remove `logActivity` calls from inside `useTokenBalances`, `useMarketPosition`, and `useMarkets` queryFn. Instead, log reads at the intentional trigger points:
  - **Initial load**: Log `getBalance`, `getMarket`, `getPosition` once from `useLendProvider`'s mount effect
  - **Post-mutation**: Log `getBalance` and `getPosition` from the mutation's `onSuccess` handler (alongside the invalidation)
  - **Background/stale refetches**: Silent — no log entry

- **Conditional delayed refetch**: Replace the unconditional 2s `setTimeout` invalidation in `useLendPosition` and `useMintAsset` with a conditional one: only re-invalidate if the data hasn't changed yet (balance still equals pre-mutation value, or position balance unchanged). This prevents double logs while still handling slow chain indexing.

- **All changes in shared layer**: `useWalletBalance`, `useLendProvider`, query hooks, mutation hooks. Both frontend and server wallet implementations use the same code path — no wallet-type-specific logging logic.

- **Light integration tests**: Test key flows (page load, open position, market switch) and assert exact log entry counts. Focused on preventing the specific duplicate-log regressions without being brittle as the demo evolves.

## Open Questions

None — all key decisions resolved.

## Next Steps

→ `/workflows:plan` for implementation details
