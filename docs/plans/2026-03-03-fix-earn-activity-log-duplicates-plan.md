---
title: Fix Earn Activity Log Duplicate Entries
type: fix
status: active
date: 2026-03-03
origin: docs/brainstorms/2026-03-03-earn-activity-log-fixes-brainstorm.md
---

# Fix Earn Activity Log Duplicate Entries

## Overview

The earn demo's Activity Log shows duplicate entries for `getBalance` and `getPosition` on page load and after lend/withdraw mutations. Additionally, selecting a different market triggers an unnecessary `getPosition` fetch+log. Root causes: (1) position data is batch-fetched but not cached in TanStack Query, (2) mutations double-invalidate queries (immediate + 2s delayed), (3) logging lives unconditionally inside `queryFn` so every refetch creates a log entry.

## Proposed Solution

Three coordinated changes (see brainstorm: `docs/brainstorms/2026-03-03-earn-activity-log-fixes-brainstorm.md`):

1. **Seed TanStack Query cache** from the batch position fetch so `useMarketPosition` never re-fetches on market switch
2. **Make query logging conditional** — only log on first fetch or when a mutation explicitly flags a refetch as log-worthy. Remove all unconditional logging from `queryFn`.
3. **Make delayed refetch conditional** — only re-invalidate after the 2s timeout if the data hasn't changed yet

All changes live in the shared hook layer. Both frontend and server wallet paths use the same code.

## Implementation Steps

### Step 1: Seed TanStack Query cache from batch fetch

**File:** `packages/demo/frontend/src/hooks/useLendProvider.ts`

**What:** After the mount effect fetches all positions (lines 88-103), seed the TanStack Query cache for each market before setting `selectedMarket`. This eliminates the race condition — when `setSelectedMarket` triggers a re-render and `useMarketPosition` enables, the cache is already populated.

**Changes:**
- Add `useQueryClient()` to `useLendProvider`
- After `Promise.all(positionPromises)` resolves (line 104), loop through results and call:
  ```ts
  queryClient.setQueryData(
    ['position', market.marketId.address, market.marketId.chainId],
    position
  )
  ```
- Also seed `['markets']` cache from the `rawMarkets` result:
  ```ts
  queryClient.setQueryData(['markets'], rawMarkets)
  ```
- These calls go BEFORE `setMarketPositions()` and `setSelectedMarket()` (lines 130-156)

**Why this works:** `selectedMarketId` is `null` until `setSelectedMarket()` is called, which means `useMarketPosition` (enabled when `!!marketId`) stays disabled during the entire batch fetch. By the time the query enables, the cache has data.

**Acceptance:**
- On page load, `useMarketPosition`'s `queryFn` does NOT fire for the default market (cache hit)
- On market switch, `useMarketPosition`'s `queryFn` does NOT fire (cache hit)
- `useMarkets`'s `queryFn` does NOT fire on initial load (cache seeded from mount effect)

### Step 2: Make query logging conditional

**Files:**
- `packages/demo/frontend/src/queries/useMarketPosition.ts`
- `packages/demo/frontend/src/queries/useMarkets.ts`
- `packages/demo/frontend/src/queries/useTokenBalances.ts`
- `packages/demo/frontend/src/hooks/useWalletBalance.ts`
- `packages/demo/frontend/src/hooks/useLendProvider.ts`

**What:** Remove unconditional `logActivity` from all three query hooks. Replace with controlled logging at intentional trigger points.

**Changes by file:**

**`useMarkets.ts`:** Remove `logActivity` parameter entirely. The queryFn becomes a plain fetch — no logging at all. Markets are fetched once; the log entry comes from the mount effect (see below).

**`useMarketPosition.ts`:** Replace unconditional `logActivity` with a `shouldLogFetch?: () => boolean` parameter. Only log when the guard returns true:
```ts
queryFn: async () => {
  if (!marketId) return null
  const activity = shouldLogFetch?.() ? logActivity?.('getPosition') : null
  // ... rest unchanged
}
```

**`useTokenBalances.ts`:** Simplify the existing conditional. Remove the `!existingData` first-fetch auto-log. Use only `shouldLogFetch`:
```ts
const activity = shouldLogFetch?.() ? logActivity?.('getBalance') : null
```

**`useWalletBalance.ts`:**
- Remove `logActivity` from `useMarkets` call (no longer accepts it)
- Add a `shouldLogPosition` ref (mirrors existing `balanceBeforeLend`/`balanceBeforeMint` pattern):
  ```ts
  const positionBeforeLend = useRef<string | null>(null)
  ```
- Pass `shouldLogFetch` to `useMarketPosition`:
  ```ts
  shouldLogFetch: () => positionBeforeLend.current !== null
  ```
- Update `shouldLogFetch` for `useTokenBalances` — keep the existing `balanceBeforeLend`/`balanceBeforeMint` guard but add an `initialFetchDone` ref:
  ```ts
  const initialBalanceFetchDone = useRef(false)
  shouldLogFetch: () => {
    if (!initialBalanceFetchDone.current) {
      initialBalanceFetchDone.current = true
      return true  // log the first fetch
    }
    return balanceBeforeMint.current !== null || balanceBeforeLend.current !== null
  }
  ```
- Set `positionBeforeLend.current` in `handleTransaction` (alongside existing `balanceBeforeLend.current` set)
- Clear `positionBeforeLend.current` when position data changes post-mutation (in the existing `useEffect` that clears `balanceBeforeLend`)

**`useLendProvider.ts`:**
- Add `useActivityLogger()` to get `logActivity`
- In mount effect, log `getMarket` and `getPosition` once each after the batch fetch succeeds:
  ```ts
  const marketActivity = logActivity('getMarket')
  const rawMarkets = await operations.getMarkets()
  marketActivity?.confirm()

  // ... batch position fetch ...
  const positionActivity = logActivity('getPosition')
  // ... after Promise.all resolves successfully ...
  positionActivity?.confirm()
  ```
- Only log one `getPosition` entry for the batch fetch (it's a single logical operation from the user's perspective)

**Logging contract after changes:**

| Trigger | getMarket | getBalance | getPosition | mutation log |
|---------|-----------|------------|-------------|-------------|
| Page load | 1x (mount effect) | 1x (first query fetch) | 1x (mount effect) | — |
| Market switch | — | — | — | — |
| Lend/Withdraw | — | 1x (shouldLogFetch) | 1x (shouldLogFetch) | 1x deposit/withdraw |
| Mint | — | 1x (shouldLogFetch) | — | 1x mint |
| Background refetch | — | — | — | — |
| Stale refetch | — | — | — | — |

### Step 3: Conditional delayed refetch

**Files:**
- `packages/demo/frontend/src/mutations/useLendPosition.ts`
- `packages/demo/frontend/src/mutations/useMintAsset.ts`
- `packages/demo/frontend/src/hooks/useWalletBalance.ts`

**What:** Remove the unconditional 2s `setTimeout` invalidation from mutation `onSuccess` handlers. Move the conditional delayed refetch to `useWalletBalance` where the balance/position refs are accessible.

**Changes:**

**`useLendPosition.ts`:** Remove the `setTimeout` block from both `useOpenPosition` and `useClosePosition` `onSuccess`. Keep only the immediate invalidation.

**`useMintAsset.ts`:** Same — remove the `setTimeout` block from `onSuccess`.

**`useWalletBalance.ts`:** Add a `useEffect` that handles delayed re-invalidation conditionally:
```ts
// Delayed refetch: only if balance hasn't changed after initial refetch
useEffect(() => {
  const needsBalanceRetry =
    !isFetchingBalances &&
    (balanceBeforeLend.current !== null && assetBalance === balanceBeforeLend.current) ||
    (balanceBeforeMint.current !== null && assetBalance === balanceBeforeMint.current)

  const needsPositionRetry =
    !isFetchingPosition &&
    positionBeforeLend.current !== null &&
    depositedAmount === positionBeforeLend.current

  if (!needsBalanceRetry && !needsPositionRetry) return

  const timer = setTimeout(() => {
    if (needsBalanceRetry) {
      queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
    }
    if (needsPositionRetry) {
      queryClient.invalidateQueries({
        queryKey: ['position', selectedMarketId?.address, selectedMarketId?.chainId]
      })
    }
  }, 2000)

  return () => clearTimeout(timer)
}, [isFetchingBalances, isFetchingPosition, assetBalance, depositedAmount, ...])
```

This is cleaner than passing callbacks between hooks: the retry logic lives where the comparison data lives.

### Step 4: Integration tests

**New file:** `packages/demo/frontend/src/hooks/__tests__/useActivityLogging.spec.ts`

**What:** Integration tests that render `useLendProvider` with mocked `operations` and a real `ActivityLogProvider`, then assert exact log entry counts for key flows.

**Test helper:**
```ts
function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  // Wrapper that provides QueryClientProvider + ActivityLogProvider
  return { wrapper, queryClient }
}

function createMockOperations(): LendProviderOperations {
  return {
    getTokenBalances: vi.fn().mockResolvedValue([...]),
    getMarkets: vi.fn().mockResolvedValue([...]),
    getPosition: vi.fn().mockResolvedValue({ balance: 0n, balanceFormatted: '0' }),
    mintAsset: vi.fn().mockResolvedValue({}),
    openPosition: vi.fn().mockResolvedValue({ transactionHash: '0x...' }),
    closePosition: vi.fn().mockResolvedValue({ transactionHash: '0x...' }),
    executeSwap: vi.fn().mockResolvedValue({}),
  }
}
```

**Test cases:**

1. **Page load** — renders hook with `ready: true`, waits for effects to settle. Assert: exactly 1 `getMarket`, 1 `getBalance`, 1 `getPosition` entries in activity log.

2. **Market switch** — after page load, call `handleMarketSelect(differentMarket)`, wait for settle. Assert: no new log entries added.

3. **Open position** — after page load, call `handleTransaction('lend', 100)`, wait for settle. Assert: exactly 1 `deposit`, 1 `getBalance`, 1 `getPosition` added.

4. **Conditional delayed refetch (data changed)** — mock `getTokenBalances` to return updated balance on first refetch. Assert: no delayed re-invalidation fires. Total: 1 `getBalance` post-mutation.

5. **Conditional delayed refetch (data stale)** — mock `getTokenBalances` to return same balance on first refetch, different on second. Assert: delayed re-invalidation fires after 2s. Still only 1 `getBalance` log (the `shouldLogFetch` ref is cleared by then).

**Test scope:** Tests mock `operations.*` at the interface level. Both wallet types produce the same `LendProviderOperations` — testing one path covers the shared logic. Add a comment noting server wallet path is structurally identical.

## System-Wide Impact

- **No impact on server wallet vs frontend wallet**: All changes are in the shared hook layer below the wallet abstraction
- **No impact on swap logging**: `SwapAction` logs directly (not through query hooks) — unchanged
- **No impact on activity persistence**: Only entries with `blockExplorerUrl` are persisted to localStorage — read-only logs (getBalance, getPosition, getMarket) were never persisted
- **Cache TTL behavior**: Position cache `staleTime: 10s` means background refetches may occur on market switch after 10s, but these will be silent (no log entry). This is correct — the UI updates silently.
- **React Strict Mode**: The existing `hasLoadedMarkets` ref guard prevents double mount-effect execution. Cache seeding happens inside the guarded block, so it's safe.

## Acceptance Criteria

- [ ] Page load shows exactly: 1x `getMarket`, 1x `getBalance`, 1x `getPosition`
- [ ] Selecting a different market produces zero new log entries
- [ ] Opening a lend position shows: 1x `deposit`, 1x `getBalance`, 1x `getPosition`
- [ ] Closing a position shows: 1x `withdraw`, 1x `getBalance`, 1x `getPosition`
- [ ] Minting shows: 1x `mint`, 1x `getBalance`
- [ ] Background/stale TanStack Query refetches produce no log entries
- [ ] Delayed refetch only fires if data hasn't changed after initial refetch
- [ ] Both frontend and server wallet paths produce identical log behavior
- [ ] All existing tests pass
- [ ] Integration tests cover page load, market switch, and open position flows

## Dependencies & Risks

- **Risk: `setQueryData` type mismatch** — The batch fetch returns `LendMarketPosition` but `useMarketPosition` queryFn returns the same type. Should be compatible, but verify the exact return shape.
- **Risk: Conditional delayed refetch timing** — If the first refetch is slower than 2s, the comparison fires before data arrives. Mitigated by checking `!isFetchingBalances` before starting the timer.
- **Out of scope:** `handleMarketSelect` sets `depositedAmount: null` causing brief flicker on market switch. This is cosmetic and unrelated to log counts.
- **Out of scope:** `addOrUpdateActivity` dedup mechanism in `ActivityLogProvider` — not needed after structural fix. May clean up in a future pass.

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-03-earn-activity-log-fixes-brainstorm.md](docs/brainstorms/2026-03-03-earn-activity-log-fixes-brainstorm.md) — Key decisions: seed TanStack cache, log at call site, conditional delayed refetch
- Existing `shouldLogFetch` pattern: `packages/demo/frontend/src/queries/useTokenBalances.ts:27`
- TanStack Query cache seeding: `queryClient.setQueryData()` API
- Test infrastructure: `packages/demo/frontend/vitest.config.ts`, `packages/demo/frontend/src/test-setup.ts`
- Existing hook test pattern: `packages/demo/frontend/src/hooks/__tests__/useSwap.spec.ts`
