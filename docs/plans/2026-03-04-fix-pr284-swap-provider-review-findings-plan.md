---
title: "fix: PR #284 Swap Provider Review Findings"
type: fix
status: active
date: 2026-03-04
origin: docs/reviews/2026-03-04-pr284-swap-provider-review.md
---

# fix: PR #284 Swap Provider Review Findings

## Enhancement Summary

**Deepened on:** 2026-03-04
**Sections enhanced:** 11 fixes across 4 phases
**Research agents used:** React Query migration patterns, DeFi security best practices, Hono error handling, Security sentinel, TypeScript reviewer, Code simplicity reviewer

### Key Improvements from Deepening
1. **Simplified Fix 5** (approvals): Dropped config abstraction -- just add code comments and tighten Permit2 expiration to 30 days (industry standard)
2. **Simplified Fix 7** (refetch cascade): Use ref pattern instead of full React Query migration -- matches existing `marketAllowlistRef` pattern in the same file
3. **Simplified Fix 9** (error leakage): Just stop leaking `error.message` to clients -- no error code taxonomy needed for a demo
4. **Fixed Fix 1** code example: Use `try/finally` only (no catch), add double-click guard
5. **Expanded Fix 8**: Now covers both `calculatePrice` AND `calculatePriceImpact` (same bug in both)
6. **Added**: Backend Zod schema must cap slippage at 0.50 to match SDK (security gap)
7. **Added**: Validate `process.argv` against forge flag allowlist in Fix 3

### New Considerations Discovered
- Permit2 expiration should be 30 days, not `maxUint48` (year ~8.9M) -- defeats Permit2's time-scoping purpose
- Backend Zod schema allows slippage 0-1.0 but SDK caps at 0.50 -- mismatched validation causes 500 instead of 400
- `buildTokenApprovalTx` and `buildPermit2ApprovalTx` are standalone functions, not class methods -- any config threading requires parameter changes
- Fix 1 must guard against double-click race condition
- `useTotalBalance.isLoading` is hardcoded to `false` -- no way to know when prices are still fetching

---

## Overview

Implement P1 (critical) and P2 (important) fixes identified by the multi-agent code review of PR #284 "SwapProvider and Uniswap support". The review found 4 critical and 7 important issues across the SDK, backend, and frontend.

## Problem Statement

PR #284 adds swap functionality via Uniswap V4. The code review identified:
- A functional bug where swap loading state never activates (users get no feedback)
- Security issues: command injection, no slippage bounds, unlimited token approvals
- Performance issues: sequential price fetches, refetch cascades
- Quality issues: precision loss, error leakage, hardcoded values, console.error in production

(see review: docs/reviews/2026-03-04-pr284-swap-provider-review.md)

## Dependency Analysis

Only one real ordering constraint: **Fix 1 before Fix 7** (both touch `useEarnSwap.ts`). Everything else can be parallelized. Combine related fixes into single commits:

- **Fix 2 + Fix 8**: Both SDK precision/correctness fixes
- **Fix 4 + Fix 11 + Zod schema**: All slippage-related
- **Fix 9 + Fix 10**: Both backend error handling

---

## Phase 1: Independent Zero-Risk Fixes

These have no dependencies and can be done in parallel.

### Fix 2 + Fix 8: SDK precision fixes

**Files:**
- `packages/sdk/src/swap/providers/uniswap/UniswapSwapProvider.ts:183-193`
- `packages/sdk/src/swap/providers/uniswap/sdk.ts:425-428, 486-493`

**Fix 2: fee:0 falsiness bug**

- [ ] Change `!filter?.fee || !filter?.tickSpacing` to `filter?.fee === undefined || filter?.tickSpacing === undefined`
- [ ] Add test case for `fee: 0` (hooks-only pool configuration)

**Fix 8: Number() precision loss**

- [ ] In `calculatePrice` (lines 425-428): Replace `Number(amountIn) / 10 ** inDecimals` with `parseFloat(formatUnits(amountIn, inDecimals))`
- [ ] In `calculatePriceImpact` (lines 486-493): Apply the same fix to all four `Number()` conversions -- this function has the same bug and handles actual trade amounts that can exceed `Number.MAX_SAFE_INTEGER`
- [ ] `formatUnits` is already imported from viem at line 2

```typescript
// Before (both functions)
const normalizedIn = Number(amountIn) / 10 ** inDecimals

// After
const normalizedIn = parseFloat(formatUnits(amountIn, inDecimals))
```

> **Research insight:** For display-only price ratios, `parseFloat(formatUnits(...))` is acceptable since the output is a human-readable string. For on-chain math, always stay in `bigint`. (DeFi security research)

- [ ] Run SDK tests: `cd packages/sdk && pnpm test`

### Fix 3: Command injection in deploy script

**File:** `packages/demo/backend/scripts/deployUniswapMarket.ts:124-140`

- [ ] Replace `execSync(cmd)` with `execFileSync` using argument arrays
- [ ] Pass env vars via `env` option (not shell assignments) -- the forge script reads them via `vm.envAddress`
- [ ] Validate `process.argv.slice(2)` against an allowlist of accepted forge flags:

```typescript
import { execFileSync } from 'child_process'

// Only allow known-safe forge flags
const ALLOWED_FORGE_FLAGS = new Set(['--verify', '--slow', '--gas-estimate-multiplier', '--legacy'])
const extraArgs = process.argv.slice(2).filter(arg => {
  const flag = arg.split('=')[0]
  return ALLOWED_FORGE_FLAGS.has(flag)
})

execFileSync('forge', [
  'script', 'script/DeployUniswapMarket.s.sol',
  '--rpc-url', rpcUrl,
  '--broadcast',
  '--private-key', privateKey,
  ...extraArgs,
], {
  cwd: contractsDir,
  stdio: 'inherit',
  env: { ...process.env, DEMO_USDC_ADDRESS: usdcAddress, DEMO_OP_ADDRESS: opAddress },
})
```

> **Research insight:** `execFileSync` bypasses the shell entirely -- arguments are passed via `argv`, so shell metacharacters have no special meaning. But unvalidated argv passthrough still allows injecting arbitrary forge flags that alter script behavior. (Security sentinel)

### Fix 10: Remove console.error from production code

**Files:**
- `packages/demo/backend/src/controllers/swap.ts:99,141`
- `packages/demo/backend/src/services/swap.ts:110`
- `packages/demo/frontend/src/components/earn/SwapAction.tsx:276`
- `packages/demo/frontend/src/hooks/useSwapAssets.ts:129`

- [ ] Remove all `console.error` statements in the files above
- [ ] The backend `App` base class provides `this.logger` (pino-style) used in `app.ts:72,87,90`, but controllers/services don't have access to it. For now, simply remove the `console.error` calls -- errors are already caught and returned as HTTP responses. The `onError` handler (Fix 9) will handle logging if needed.
- [ ] Remove frontend `console.error` calls entirely
- [ ] Also remove duplicate error logging in `services/lend.ts:38,64` and `controllers/lend.ts:89,132` while we're at it (same pattern)
- [ ] Run `pnpm lint` and `pnpm typecheck`

> **Research insight:** The codebase has a split: `app.ts` uses structured pino logging via `this.logger`, but all controllers/services use raw `console.error`. Consolidating to `onError` (Fix 9) eliminates the inconsistency. (Repo research)

---

## Phase 2: Frontend State Fixes

### Fix 1: isSwapping always false (FUNCTIONAL BUG)

**Files:**
- `packages/demo/frontend/src/hooks/useEarnSwap.ts:31`
- `packages/demo/frontend/src/hooks/useSwap.ts` (delete)
- `packages/demo/frontend/src/hooks/__tests__/useSwap.spec.ts` (delete)

- [ ] In `useEarnSwap.ts`: Remove `import` and call to `useSwap()`
- [ ] Add `const [isSwapping, setIsSwapping] = useState(false)` in `useEarnSwap`
- [ ] Wrap `handleSwap` with `try/finally` (no catch needed -- errors propagate naturally):

```typescript
const handleSwap = async (...) => {
  if (isSwapping) return  // Double-click guard
  setIsSwapping(true)
  try {
    const result = await operations.executeSwap(...)
    const activity = logActivity('getBalance')
    await queryClient.invalidateQueries(...)
    activity?.confirm()
    refetchSwapAssets()
    return result
  } finally {
    setIsSwapping(false)
  }
}
```

> **Research insight:** The current `handleSwap` (lines 93-118) has no try/catch -- it just awaits `operations.executeSwap()` followed by activity logging. The plan's original code example incorrectly added a catch block. Use `try/finally` only. Also add `if (isSwapping) return` as a double-click guard -- without it, rapid clicks before React state propagates could fire duplicate swaps. (TypeScript reviewer, Security sentinel)

- [ ] Delete `packages/demo/frontend/src/hooks/useSwap.ts` (~100 LOC dead code)
- [ ] Delete `packages/demo/frontend/src/hooks/__tests__/useSwap.spec.ts` (~123 LOC dead tests)
- [ ] Remove any remaining imports of `useSwap` elsewhere
- [ ] Verify `isSwapping` flows correctly to `Earn.tsx` -> `SwapAction.tsx` button state
- [ ] Run frontend tests and typecheck

### Fix 7: useSwapAssets refetch cascade (SIMPLIFIED)

**File:** `packages/demo/frontend/src/hooks/useSwapAssets.ts`

The root cause is `tokenBalances` in the `fetchAssets` dependency array (line 133). React Query returns new array references on every refetch, triggering unnecessary `fetchAssets` calls. The simplest fix uses the same ref pattern already in the file for `marketAllowlist` (line 60-61).

- [ ] Move `tokenBalances` to a ref, matching the existing `marketAllowlistRef` pattern:

```typescript
// Already exists in the file:
const marketAllowlistRef = useRef(marketAllowlist)
marketAllowlistRef.current = marketAllowlist

// Add the same pattern for tokenBalances:
const tokenBalancesRef = useRef(tokenBalances)
tokenBalancesRef.current = tokenBalances
```

- [ ] Update `fetchAssets` callback to use `tokenBalancesRef.current` instead of `tokenBalances`
- [ ] Remove `tokenBalances` from the `useCallback` dependency array
- [ ] Run frontend typecheck

> **Research insight:** A full React Query migration was considered but is over-scoped for this bug. The ref pattern is already proven in this file and fixes the cascade with ~5 lines changed instead of a major refactor. If a React Query migration is desired later, the patterns are documented: use `useQuery` with key `['swapAssets', walletAddress]`, `enabled: !!walletAddress`, `staleTime: 30_000`. (Simplicity reviewer, React Query research)

### Fix 6: Sequential price fetches in useTotalBalance

**File:** `packages/demo/frontend/src/hooks/useTotalBalance.ts:33-59`

- [ ] Replace serial `for` loop with `Promise.allSettled` (not `Promise.all` -- graceful degradation if one price fetch fails)
- [ ] Call `setPrices` once after all settle, not per-asset:

```typescript
const fetchPrices = useCallback(async () => {
  const usdcAsset = assets.find(a => isStablecoin(a.asset.metadata.symbol))
  if (!usdcAsset) return

  const toFetch = assets.filter(
    a => !isStablecoin(a.asset.metadata.symbol) && !priceCache.current.has(a.asset.metadata.symbol)
  )
  if (toFetch.length === 0) return

  const results = await Promise.allSettled(
    toFetch.map(async (asset) => {
      const tokenAddress = asset.asset.address[asset.chainId] as Address | undefined
      const usdcAddress = usdcAsset.asset.address[asset.chainId] as Address | undefined
      if (!tokenAddress || !usdcAddress) return null
      const quote = await getPrice({
        tokenInAddress: tokenAddress,
        tokenOutAddress: usdcAddress,
        chainId: asset.chainId,
        amountIn: 1,
      })
      return quote
        ? { symbol: asset.asset.metadata.symbol, price: parseFloat(quote.amountOutFormatted) || 0 }
        : null
    })
  )

  let updated = false
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      priceCache.current.set(result.value.symbol, result.value.price)
      updated = true
    }
    // rejected results silently dropped -- partial prices still useful
  }
  if (updated) setPrices(new Map(priceCache.current))
}, [assets, getPrice])
```

> **Research insight:** `Promise.allSettled` is critical here. `Promise.all` would fail all price fetches if one RPC call errors. With `allSettled`, partial results are still rendered -- users see most prices even if one token's quoter call fails. Also note: `isLoading` is hardcoded to `false` (line 88) -- this hook never signals loading state. Consider returning `isFetching` state if UX needs it later. (Performance oracle, React Query research)

- [ ] Run frontend typecheck

---

## Phase 3: Slippage Chain

### Fix 4: SDK slippage bounds validation + Backend Zod schema

**Files:**
- `packages/sdk/src/swap/core/SwapProvider.ts:111`
- `packages/demo/backend/src/controllers/swap.ts:42`

**SDK validation:**

- [ ] Add slippage validation in `SwapProvider.execute()` AFTER `internalParams` resolution (line ~115), before `_execute()` call:

```typescript
const MAX_SLIPPAGE = 0.50 // 50% absolute maximum

// Validate the already-resolved slippage from internalParams, not params
if (internalParams.slippage < 0 || internalParams.slippage > MAX_SLIPPAGE) {
  throw new Error(
    `Slippage ${internalParams.slippage} exceeds allowed range [0, ${MAX_SLIPPAGE * 100}%]`
  )
}
```

> **Research insight:** Validate `internalParams.slippage` (already resolved at line 111), not `params.slippage`. The original plan recomputed slippage, which duplicates logic. Also: for a server-side SDK with no human confirmation, some DeFi security researchers recommend a 5% hard cap. However, 50% is more appropriate for a general-purpose SDK that may serve volatile pairs. The `defaultSlippage` of 0.5% provides the safe default. (TypeScript reviewer, DeFi security research)

**Backend Zod schema alignment:**

- [ ] Update `ExecuteSwapRequestSchema` slippage validation to match SDK cap:

```typescript
// Before
slippage: z.number().min(0).max(1).optional(),

// After
slippage: z.number().min(0).max(0.50).optional(),
```

> **Research insight (NEW):** Without this change, the backend accepts slippage 0.51-1.0, passes it to the SDK, and the SDK throws -- resulting in a 500 error instead of a 400 validation error. The Zod schema should match the SDK's hard cap. (Security sentinel)

- [ ] Add tests for slippage boundary values: 0, 0.005, 0.05, 0.50, 0.51 (should throw), 1.0 (should throw), -0.01 (should throw)
- [ ] Run SDK tests

### Fix 11: Hardcoded slippage in ReviewSwapModal

**File:** `packages/demo/frontend/src/components/earn/ReviewSwapModal.tsx:49`

- [ ] Pass actual slippage value as a prop to `ReviewSwapModal`
- [ ] Replace `parsedOut * 0.995` with `parsedOut * (1 - slippage)` using the prop
- [ ] Also update the hardcoded `"0.5%"` display string (line 174) to derive from the prop
- [ ] Thread slippage through from `SwapAction.tsx` -> `ReviewSwapModal` props
- [ ] Default to `0.005` (0.5%) if not provided, matching SDK default
- [ ] Run frontend typecheck

---

## Phase 4: Backend Error Handling + Security

### Fix 9: Error messages leak internals (SIMPLIFIED)

**Files:**
- `packages/demo/backend/src/controllers/swap.ts:99-103,141-144`
- `packages/demo/backend/src/services/swap.ts:110-114`

For a demo backend, a full error code taxonomy is overkill. Just stop leaking `error.message` to clients:

- [ ] In controller catch blocks, remove `message` field from JSON responses:

```typescript
// Before
return c.json({
  error: 'Failed to get swap price',
  message: error instanceof Error ? error.message : 'Unknown error',
}, 500)

// After
return c.json({ error: 'Failed to get swap price' }, 500)
```

- [ ] Remove duplicate error logging: the service layer catches, logs, and re-throws (swap.ts:109-116), then the controller catches and logs again. **Pick one layer**: remove the service-layer catch/log/rethrow -- let errors propagate to the controller, which returns the response.
- [ ] Run backend tests: `cd packages/demo/backend && pnpm test`

> **Research insight:** The Hono research identified a comprehensive `AppError` + `onError` pattern that eliminates all duplicate logging. This is the right long-term approach but is over-scoped for this fix. The minimal fix (stop leaking messages, remove duplicates) achieves the security goal. If the backend grows, consider the centralized `onError` pattern: define `AppError` class with `code`/`statusCode`, use `app.onError()` to catch all errors, log once, return structured responses. (Hono research, Simplicity reviewer)

### Fix 5: Tighten Permit2 expiration (SIMPLIFIED)

**File:** `packages/sdk/src/swap/providers/uniswap/permit2.ts:113-134`

The original plan proposed an `approvalMode` config option. This is over-engineered for a demo app. Instead, make two targeted improvements:

- [ ] In `buildPermit2ApprovalTx` (line 126): Replace `maxUint48` expiration with 30 days from now:

```typescript
// Before
args: [token, spender, maxUint160, maxExpiration],

// After
const THIRTY_DAYS = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
args: [token, spender, maxUint160, THIRTY_DAYS],
```

- [ ] Add a code comment on the `maxUint256` ERC20 approval (line 100) noting the tradeoff:

```typescript
// ERC20 -> Permit2: maxUint256 is industry standard (Permit2 is immutable/audited).
// For production with real funds, consider exact-amount approvals instead.
args: [permit2Address, maxUint256],
```

> **Research insight:** The ERC20-to-Permit2 unlimited approval (`maxUint256`) is the Uniswap-canonical pattern and is safe because Permit2 is an immutable, non-upgradeable singleton. The real risk is in the Permit2-to-UniversalRouter layer, where `maxUint48` expiration (year ~8.9 million) defeats Permit2's time-scoping purpose. Industry standard is 30 days for server wallets. The `buildTokenApprovalTx` and `buildPermit2ApprovalTx` are standalone exported functions (not class methods), so adding a config option would require parameter changes to thread config through from `_execute()`. A comment + 30-day expiration achieves the security improvement without the abstraction overhead. (DeFi security research, TypeScript reviewer, Simplicity reviewer)

- [ ] Run SDK tests

---

## Acceptance Criteria

### P1 (Must pass before merge)
- [ ] Swap button shows loading state during swap execution (Fix 1)
- [ ] Double-click on swap button does not fire duplicate swaps (Fix 1)
- [ ] `fee: 0` pool configurations are accepted by `resolveUniswapFilter` (Fix 2)
- [ ] Deploy script uses `execFileSync` with argument arrays, no shell interpolation (Fix 3)
- [ ] SDK rejects slippage values outside valid range (0 to 0.50) (Fix 4)

### P2 (Should pass before merge)
- [ ] Permit2 approval expires after 30 days, not year 8.9M (Fix 5)
- [ ] Price fetches in `useTotalBalance` run concurrently via `Promise.allSettled` (Fix 6)
- [ ] `useSwapAssets` uses ref pattern for `tokenBalances`, no refetch cascade (Fix 7)
- [ ] `calculatePrice` AND `calculatePriceImpact` use `formatUnits` instead of `Number()` (Fix 8)
- [ ] Backend error responses do not contain `error.message` internals (Fix 9)
- [ ] No `console.error` statements in production code (Fix 10)
- [ ] `ReviewSwapModal` uses actual slippage value, not hardcoded `0.995` (Fix 11)
- [ ] Backend Zod schema caps slippage at 0.50 to match SDK (Fix 4 addendum)

### Quality Gates
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (SDK: all 320+ tests)
- [ ] `pnpm build` passes

## Technical Considerations

- **Fix 4 is a soft breaking change** for any SDK consumer currently passing slippage > 50%. Backend Zod schema update catches this at the API boundary with a 400 instead of a 500.
- **Fix 5 changes Permit2 expiration from infinite to 30 days.** Users who haven't swapped in 30 days will need a new Permit2 approval transaction (one extra tx, ~50k gas).
- **Fix 6 uses `Promise.allSettled`** instead of `Promise.all` to avoid all-or-nothing failure. Partial price results are still rendered.
- **Fix 7 uses a ref pattern** (5 lines) instead of a full React Query migration (~150 lines). The ref pattern matches the existing `marketAllowlistRef` in the same file. React Query migration can be done separately if needed.
- **Fix 8 now covers both functions** (`calculatePrice` AND `calculatePriceImpact`) -- the same `Number(bigint)` precision bug appears in both.

---

## Phase 5: Additional Findings (2026-03-05 Review Round)

Second review with 6 parallel agents (TypeScript, Security+ethskills, Architecture, Performance, Simplicity, Pattern Recognition). Findings below are NEW -- not covered by Phases 1-4.

### Fix 12: Unvalidated chainId cast to SupportedChainId
**Files:** `packages/demo/backend/src/controllers/swap.ts` lines 65, 90-91, 124-125
- [ ] Zod schema transforms chainId string->number but never validates it's a supported chain
- [ ] `chainId as SupportedChainId` cast swallows invalid values (client can send `chainId=99999`)
- [ ] Add `.refine()` to Zod schemas validating chainId is in the supported set
- **Flagged by:** TypeScript, Security, Pattern Recognition

### Fix 13: `resolveAsset` searches wrong token list
**File:** `packages/demo/backend/src/utils/assets.ts`
- [ ] Searches `SUPPORTED_TOKENS` from SDK, but demo uses `USDC_DEMO`/`OP_DEMO` defined locally in `config/assets.ts`
- [ ] If demo tokens aren't in `SUPPORTED_TOKENS`, resolveAsset always throws
- [ ] Resolve against the configured asset list instead
- **Flagged by:** TypeScript

### Fix 14: No guard against same-asset swaps
**File:** `packages/sdk/src/swap/core/SwapProvider.ts`
- [ ] `filterContainsPair` returns true when assetIn===assetOut (both `includes` checks pass on same symbol)
- [ ] Add early check in `execute()`: throw if assetIn.symbol === assetOut.symbol
- **Flagged by:** TypeScript

### Fix 15: Empty catch-rethrow in swap service
**File:** `packages/demo/backend/src/services/swap.ts` lines 109-111
- [ ] `catch (error) { throw error }` does nothing -- remove entirely
- **Flagged by:** TypeScript, Architecture, Pattern Recognition, Simplicity (all 4 agents)

### Fix 16: Inconsistent error handling in swap controller
**File:** `packages/demo/backend/src/controllers/swap.ts`
- [ ] `getMarkets` includes `message` field, but `getPrice` and `executeSwap` don't
- [ ] `executeSwap` missing `console.error` (lend controller has it)
- [ ] Make all catch blocks consistent with lend controller pattern
- **Flagged by:** TypeScript, Architecture, Security, Pattern Recognition

### Fix 17: `executeSwap` on LendProviderOperations interface (domain violation)
**File:** `packages/demo/frontend/src/hooks/useLendProvider.ts` lines 34-39
- [ ] Swap operations defined on a lend-specific interface
- [ ] Rename to `EarnOperations` or create separate `SwapOperations` interface
- **Flagged by:** Pattern Recognition

### Fix 18: Parallel allowance checks in _execute
**File:** `packages/sdk/src/swap/providers/uniswap/UniswapSwapProvider.ts` lines 90-116
- [ ] `checkTokenAllowance` and `checkPermit2Allowance` are independent reads called sequentially
- [ ] Use `Promise.all([...])` to save one RPC round trip (~100-500ms)
- **Flagged by:** Performance

### Fix 19: Gate useTotalBalance fetch behind swap tab
**File:** `packages/demo/frontend/src/hooks/useTotalBalance.ts`
- [ ] Fires price fetches for all assets on mount, even when user is on lend tab
- [ ] Accept `enabled` param, gate on `activeTab === 'swap'`
- **Flagged by:** Performance

### Fix 20: Duplicate asset definitions between SDK and backend
**Files:** `packages/sdk/src/constants/assets.ts`, `packages/demo/backend/src/config/assets.ts`
- [ ] Identical USDC_DEMO and OP_DEMO definitions in two places
- [ ] Backend should import from SDK
- **Flagged by:** TypeScript

### Fix 21: Hardcoded marketAllowlist in frontend
**File:** `packages/demo/frontend/src/hooks/useEarnSwap.ts` line 82
- [ ] `marketAllowlist: [USDC_DEMO, OP_DEMO]` hardcoded in frontend; backend already has this configured
- [ ] Derive from API response or pass as parameter
- **Flagged by:** TypeScript, Architecture, Pattern Recognition

### Fix 22: `any` types in MockSwapProvider and swap.spec.ts
**Files:** `packages/sdk/src/swap/__mocks__/MockSwapProvider.ts` lines 108-113, `packages/demo/backend/src/services/swap.spec.ts` lines 44, 126, 141
- [ ] Type mock params as `Asset` instead of `any`
- [ ] Use `Partial<T>` patterns instead of `as any` in test mocks
- **Flagged by:** TypeScript

### Fix 23: Floating-point slippage precision risk
**File:** `packages/sdk/src/swap/providers/uniswap/sdk.ts` lines 357-358
- [ ] `(1 - slippage) * 10000` uses IEEE 754 float math, fragile for non-round values
- [ ] Use `Math.round` instead of `Math.floor`, or accept slippage as basis points
- **Flagged by:** TypeScript, Security

### Fix 24: Duplicate logo/symbol maps
**Files:** `packages/demo/frontend/src/utils/activitySummary.ts` SYMBOL_LOGO, `packages/demo/frontend/src/hooks/useSwapAssets.ts` getAssetLogo()
- [ ] Consolidate into one shared constant
- **Flagged by:** Simplicity

### Fix 25: handleSwap returns undefined when isSwapping
**File:** `packages/demo/frontend/src/hooks/useEarnSwap.ts` line 104
- [ ] Caller accesses `result.blockExplorerUrl` which throws on undefined
- [ ] Return sentinel value or early-return with empty object
- **Flagged by:** Performance

### Fix 26: formatSwapAmount called 3x for same value
**File:** `packages/demo/frontend/src/components/earn/SwapAction.tsx` lines 542-548
- [ ] Compute once and destructure: `const { main, secondary } = formatSwapAmount(priceQuote.price)`
- **Flagged by:** Performance

### Fix 27: Misleading 'getBalance' activity log after swap
**File:** `packages/demo/frontend/src/hooks/useEarnSwap.ts` line 113
- [ ] Logs activity as 'getBalance' when it's a post-swap balance refresh
- [ ] Use a more accurate name or don't log as user-visible activity
- **Flagged by:** Architecture

---

## User Nits

### Nit 1: Refactor deployUniswapMarket.ts into helper functions
**File:** `packages/demo/backend/scripts/deployUniswapMarket.ts`
- [ ] Move constant validation into its own helper function
- [ ] Move the main code blocks into helper functions
- [ ] Have the main function just call, step by step, each helper function for readability

### Nit 2: serializeBigInt in controller is surprising mutation
**File:** `packages/demo/backend/src/controllers/swap.ts`
- [ ] `return c.json({ result: serializeBigInt(markets) })` — serialization hidden in controller is surprising
- [ ] Evaluate whether serialization should happen inside the service (e.g., `getMarkets`, `getPrice`) or if there's a better pattern
- [ ] Check if `serializeBigInt` is used in multiple controllers for multiple reasons or could be centralized

### Nit 3: Redundant auth checks in controllers behind authMiddleware
**Files:** `packages/demo/backend/src/controllers/swap.ts`, `lend.ts`, `wallet.ts`
- [ ] Routes using `authMiddleware` in router.ts already guarantee `c.get('auth')` is set
- [ ] The `const auth = c.get('auth') ... if (!auth || !auth.idToken)` checks in controllers are redundant
- [ ] Add a `requireAuth(c)` helper that returns the typed AuthContext (throws/returns error if missing)
- [ ] Replace all duplicate auth guard blocks with the helper

### Nit 4: Verbose error response blocks in controllers
**Files:** `packages/demo/backend/src/controllers/swap.ts`, `packages/demo/backend/src/controllers/lend.ts`, `packages/demo/backend/src/controllers/wallet.ts`
- [ ] Many 6-8 line error return blocks like `return c.json({ error: '...', message: error instanceof Error ? ... }, 500)`
- [ ] Create a `helpers/errors.ts` utility (e.g., `errorResponse(c, 'message', status)`) to reduce boilerplate
- [ ] Apply across all controllers for consistency
- [ ] Also stop leaking `error.message` to clients (security concern from review)

### Nit 5: Reuse SDK types in backend swap service where possible
**File:** `packages/demo/backend/src/services/swap.ts`
- [ ] `SwapParams` and `PriceParams` are local types using `Address` (backend API layer), while SDK exports `SwapExecuteParams` and `SwapPriceParams` using `Asset` objects — so the local types bridge the API→SDK gap and can't be fully replaced
- [ ] However, `SwapReceipt`, `SwapMarket`, `SwapPrice` are already correctly imported from SDK
- [ ] Consider: export a utility type from SDK for "address-based" swap params, or just keep the current pattern with a comment noting the intentional divergence
- **Status:** Current pattern is reasonable — backend types bridge Address→Asset

_(More nits to be added as user provides them)_

---

## Sources

- **Origin review:** [docs/reviews/2026-03-04-pr284-swap-provider-review.md](docs/reviews/2026-03-04-pr284-swap-provider-review.md) -- multi-agent code review with 6 specialized reviewers
- **Second review (2026-03-05):** 6 parallel agents -- TypeScript, Security+ethskills:security, Architecture, Performance, Simplicity, Pattern Recognition
- **PR:** https://github.com/ethereum-optimism/actions/pull/284
- **SpecFlow Analysis:** Dependency chains, edge cases, regression risks
- **Deepening research (2026-03-04):**
  - React Query migration patterns (TanStack Query v5 best practices)
  - DeFi security patterns (token approvals, slippage, Permit2, bigint precision)
  - Hono structured error handling (AppError + onError pattern)
  - Security sentinel review (gaps: Zod schema mismatch, double-click race)
  - TypeScript review (mismatches: calculatePriceImpact omission, try/finally, standalone functions)
  - Simplicity review (Fix 5/7/9 over-engineering for demo app)
