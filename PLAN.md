# Implementation Plan: Expose Public Client (#232)

## Overview
Add `getPublicClient()` method to Actions SDK to expose ChainManager's public clients.

## Tasks

### 1. Core Implementation
**File:** `packages/sdk/src/actions.ts`

Add public method after constructor:
```typescript
/**
 * Get public client for a specific chain
 * @param chainId - The chain ID to retrieve the public client for
 * @returns PublicClient instance for the specified chain
 * @throws Error if no client is configured for the chain ID
 * @example
 * ```typescript
 * const publicClient = actions.getPublicClient(10) // Optimism
 * const blockNumber = await publicClient.getBlockNumber()
 * ```
 */
getPublicClient(chainId: SupportedChainId): PublicClient {
  return this.chainManager.getPublicClient(chainId)
}
```

**Imports needed:**
- Already imports `SupportedChainId` ✓
- Already imports `ChainManager` ✓
- Need to import `PublicClient` from viem

### 2. Export Types
**File:** `packages/sdk/src/index.ts`

Add to exports:
```typescript
export type { PublicClient } from 'viem'
```

### 3. Unit Tests
**File:** `packages/sdk/src/__tests__/actions.spec.ts` (or new file)

Test cases:
- ✓ Returns PublicClient for valid chain ID
- ✓ Throws error for unsupported chain ID
- ✓ Returns same client instance on repeated calls (ChainManager caches)

### 4. Integration Test
**File:** `packages/sdk/src/__tests__/actions.integration.test.ts` (or new file)

Test case:
- ✓ Use returned client to call `getBlockNumber()` on testnet
- ✓ Verify client respects custom RPC URL from config

## Files to Modify
1. `packages/sdk/src/actions.ts` - Add method
2. `packages/sdk/src/index.ts` - Export PublicClient type
3. Tests (determine location after checking existing test structure)

## Testing Commands
```bash
# Build
pnpm build

# Lint
pnpm lint:fix

# Tests
pnpm test --filter sdk
```

## Edge Cases
- Unsupported chain ID → ChainManager already throws proper error ✓
- Client not initialized → Impossible (clients created in constructor) ✓

## Documentation
JSDoc inline (as shown above) should be sufficient for initial implementation.
README or docs site update can be separate PR if needed.

## Verification
After implementation, verify:
1. TypeScript compilation succeeds
2. All tests pass
3. Public API exports PublicClient type
4. Method shows up in IDE autocomplete
