# PR #284 Code Review: SwapProvider and Uniswap Support

**Date:** 2026-03-04
**Branch:** `kevin/uniswap-swap-provider`
**PR:** https://github.com/ethereum-optimism/actions/pull/284
**Size:** 10,090 additions, 2,284 deletions, ~100 files

## Summary

This PR adds token swap functionality via Uniswap V4 across SDK, backend, and frontend. The SDK layer is well-designed with clean provider/namespace patterns matching the existing LendProvider architecture. 320 tests pass. The main concerns are a functional bug in swap loading state, safety issues in validation, and frontend state management inconsistencies.

---

## P1 - Critical (Fix Before Merge)

### 1. `isSwapping` is always false (Functional Bug)

**Location:** `packages/demo/frontend/src/hooks/useEarnSwap.ts:31`

`useEarnSwap` calls `useSwap()` with no arguments, creating an orphaned hook instance. `isExecuting` is never set to `true` because actual swap execution goes through `operations.executeSwap()`, not the hook's `executeSwap`. Users get no loading feedback during swaps.

**Fix:** Remove `useSwap()` call. Track `isSwapping` with a simple `useState<boolean>(false)` wrapper around `handleSwap` in `useEarnSwap`. This also eliminates ~200 LOC of dead code (`useSwap` hook + test).

### 2. `fee: 0` falsiness bug in `resolveUniswapFilter`

**Location:** `packages/sdk/src/swap/providers/uniswap/UniswapSwapProvider.ts:183-193`

```typescript
if (!filter?.fee || !filter?.tickSpacing) {
  throw new Error(...)
}
```

`!filter?.fee` treats `fee: 0` as falsy. Fee=0 is a valid Uniswap V4 configuration (hooks-only pools). This incorrectly rejects valid pool configurations.

**Fix:** Change to `filter?.fee === undefined || filter?.tickSpacing === undefined`.

### 3. Command injection in deploy script

**Location:** `packages/demo/backend/scripts/deployUniswapMarket.ts:124-140`

`process.argv.slice(2)` and env vars are interpolated directly into an `execSync` shell string without sanitization. An attacker who can influence CLI arguments could inject arbitrary shell commands.

**Fix:** Use `execFileSync` or `spawn` with argument arrays instead of shell string interpolation. Validate all interpolated values.

### 4. No SDK slippage bounds validation

**Location:** `packages/sdk/src/swap/core/SwapProvider.ts:111`

The SDK accepts arbitrary slippage values (even 1.0 = 100%), which sets `amountOutMinimum` to 0 and enables complete sandwich attacks. The backend validates 0-1 range via Zod, but direct SDK consumers have no protection.

**Fix:** Add slippage bounds validation in `SwapProvider.execute()`. Reject values above 0.05 (5%) by default, with an explicit override flag for advanced users.

---

## P2 - Important (Should Fix)

### 5. Unlimited token approvals

**Location:** `packages/sdk/src/swap/providers/uniswap/permit2.ts:97-134`

Both `buildTokenApprovalTx` and `buildPermit2ApprovalTx` grant `maxUint256`/`maxUint160` approvals. If Permit2 or Universal Router contracts were compromised, all approved tokens are drainable.

**Fix:** Approve only the exact amount needed for the current swap. At minimum, add a config option for approval strategy.

### 6. Sequential price fetches in `useTotalBalance`

**Location:** `packages/demo/frontend/src/hooks/useTotalBalance.ts:33-59`

Serial `await` in `for` loop, plus `setPrices()` per asset causing N re-renders. With 10 assets at 200ms/call, total balance takes ~2 seconds to populate in a staircase pattern.

**Fix:** Use `Promise.all` for concurrent fetches, call `setPrices` once after all complete.

### 7. `useSwapAssets` refetch cascade

**Location:** `packages/demo/frontend/src/hooks/useSwapAssets.ts:63-137`

`tokenBalances` in `fetchAssets` dependency array creates a new reference on every React Query refetch, triggering unnecessary `fetchAssets()` calls. Combined with the `useEffect` in `useEarnSwap.ts` that calls `refetchSwapAssets()` on tab switch, this causes double-fetching.

**Fix:** Migrate `useSwapAssets` to React Query instead of manual `useState`/`useEffect`, matching the rest of the codebase.

### 8. `Number()` precision loss on bigints

**Location:** `packages/sdk/src/swap/providers/uniswap/sdk.ts:425-428`

`Number(amountIn)` loses precision for bigint values exceeding `Number.MAX_SAFE_INTEGER` (2^53). For 18-decimal tokens, amounts above ~9007 tokens produce inaccurate prices.

**Fix:** Use `formatUnits` (already imported) and `parseFloat` instead of `Number()` on bigints.

### 9. Error messages leak internals

**Location:** `packages/demo/backend/src/controllers/swap.ts:99-103,141-144`

Backend returns `error.message` to clients, potentially revealing contract addresses, RPC details, or infrastructure info.

**Fix:** Return generic error messages to clients. Log details server-side only. Add machine-readable error codes.

### 10. `console.error` in production code

**Locations:**
- `packages/demo/backend/src/controllers/swap.ts:99,141`
- `packages/demo/backend/src/services/swap.ts:110`
- `packages/demo/frontend/src/components/earn/SwapAction.tsx:276`
- `packages/demo/frontend/src/hooks/useSwapAssets.ts:129`

Project guidelines say "Remove console.log statements."

**Fix:** Remove or replace with structured logging utility.

### 11. Hardcoded slippage in ReviewSwapModal

**Location:** `packages/demo/frontend/src/components/earn/ReviewSwapModal.tsx:49`

```typescript
const formattedMinReceived = formatSwapAmount((parsedOut * 0.995).toFixed(6))
```

Hardcoded 0.5% slippage regardless of actual slippage parameter. "Minimum received" will be wrong if slippage config changes.

**Fix:** Derive from actual slippage parameter used in the transaction.

---

## P3 - Nice-to-Have (Enhancements)

### 12. Dead subgraph code (~100 LOC)

**Location:** `packages/sdk/src/swap/providers/uniswap/UniswapSwapProvider.ts:195-340`

`SUBGRAPH_URLS` all `undefined`. `_getMarket`/`_getMarkets` will always throw "Subgraph not available" or return `[]`. ~100 lines of GraphQL query code that can never execute.

**Fix:** Stub with `throw new Error('Market discovery not yet supported')`. Add subgraph code when URLs exist.

### 13. Duplicate asset definitions

**Location:** `packages/demo/backend/src/config/assets.ts` vs `packages/sdk/src/constants/assets.ts`

`USDC_DEMO` and `OP_DEMO` defined in both SDK and backend.

**Fix:** Backend should import from SDK.

### 14. Backend drops exact-output swap support

**Location:** `packages/demo/backend/src/controllers/swap.ts:32-43`

`ExecuteSwapRequestSchema` requires `amountIn` as mandatory. SDK supports `amountOut` for exact-output swaps but the API doesn't expose this.

**Fix:** Make both optional in schema, validate exactly one is present.

### 15. Backend error responses lack structured codes

**Location:** `packages/demo/backend/src/controllers/swap.ts`

All errors return generic 500s with `{ error: "Failed to ...", message }`. No way to distinguish "unsupported chain" from "insufficient balance".

**Fix:** Map SDK error patterns to HTTP status codes (400, 404, 422). Include machine-readable `code` field.

### 16. Parallelize allowance checks

**Location:** `packages/sdk/src/swap/providers/uniswap/UniswapSwapProvider.ts`

`checkTokenAllowance` and `checkPermit2Allowance` are independent but run sequentially. Saves ~50-200ms per swap.

**Fix:** Use `Promise.all`.

### 17. `any` in MockSwapProvider

**Location:** `packages/sdk/src/swap/__mocks__/MockSwapProvider.ts:108-113`

`testValidateMarketAllowed` params typed `any` instead of `Asset`.

**Fix:** Change to `Asset` type.

### 18. Unbounded localStorage ledger

**Location:** `packages/demo/frontend/src/hooks/useLendBalance.ts`

`useLendBalance` appends entries to localStorage forever without pruning.

**Fix:** Cap at last N entries or prune by age.

---

## Review Agents Used

- kieran-typescript-reviewer
- security-sentinel
- performance-oracle
- architecture-strategist
- code-simplicity-reviewer
- agent-native-reviewer

## Architectural Notes

**Strengths:**
- SDK SwapProvider/namespace pattern faithfully mirrors LendProvider architecture
- Template method pattern (public validate + protected abstract implement) is well-executed
- Strong test coverage: 320 tests passing, 449-line SwapProvider test suite
- Permit2 two-step approval flow correctly handled
- Clean RESTful API design with Zod validation

**Weaknesses:**
- Frontend state management inconsistent (manual state vs React Query)
- SwapAction.tsx at 593 lines needs decomposition
- `useSwap` hook is mostly dead code
- Hardcoded demo values should come from configuration
