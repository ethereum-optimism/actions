# Issue #232: Expose Public Client for Chain

## Context
PR #230 needed to create a public client manually to interact with on-chain contracts. Currently, developers have to import viem and create their own public clients, even though the Actions SDK already manages public clients internally via ChainManager.

**Original PR code:**
```typescript
const publicClient = createPublicClient({
  chain: optimismSepolia,
  transport: env.OP_SEPOLIA_RPC_URL ? http(env.OP_SEPOLIA_RPC_URL) : http(),
})
```

## Problem
- ChainManager already creates and manages public clients for all configured chains
- These clients respect custom RPC URLs from chain configs
- But there's no public API to access them
- Forces developers to duplicate client creation logic

## Current State
**ChainManager (internal service):**
- Has `getPublicClient(chainId: SupportedChainId): PublicClient` method
- Already used internally by providers (Aave, Morpho, Uniswap, etc.)
- Manages clients with proper transport/fallback configuration

**Actions SDK:**
- Has private `chainManager: ChainManager` property
- No public method to access public clients

## Solution Options

### Option 1: Expose via Actions class (Recommended)
Add `getPublicClient()` method to Actions class:

```typescript
/**
 * Get public client for a specific chain
 * @param chainId - The chain ID to retrieve the public client for
 * @returns PublicClient instance for the specified chain
 * @throws Error if no client is configured for the chain ID
 */
getPublicClient(chainId: SupportedChainId): PublicClient {
  return this.chainManager.getPublicClient(chainId)
}
```

**Pros:**
- Simple delegation pattern
- Consistent with Actions SDK architecture
- No breaking changes
- Natural discoverability (actions.getPublicClient())

**Cons:**
- None

### Option 2: Expose ChainManager directly
Make `chainManager` public instead of private:

```typescript
public readonly chainManager: ChainManager
```

**Pros:**
- Access to all ChainManager methods (getChain, getRpcUrls, etc.)

**Cons:**
- Exposes internal implementation details
- Makes it harder to refactor internals later
- Less controlled API surface

### Option 3: Add to namespace (e.g., actions.chain.getPublicClient())
Create new ChainNamespace with public client access:

**Cons:**
- Over-engineered for simple use case
- More files/complexity
- Breaking pattern for utility methods

## Recommendation
**Option 1** - Add `getPublicClient()` method to Actions class.

**Rationale:**
- Minimal, focused API addition
- Follows existing delegation patterns (Actions delegates to namespaces)
- Easy to document and use
- Keeps internal architecture flexible

## Implementation Plan
1. Add `getPublicClient()` method to Actions class
2. Export `PublicClient` type from viem via SDK index
3. Add tests covering:
   - Successful client retrieval
   - Error case (unsupported chain)
   - Client works for on-chain calls
4. Update SDK documentation

## Testing Strategy
- Unit test: verify method delegates correctly
- Integration test: use returned client to make on-chain call
- Error test: verify error thrown for unsupported chain

## Questions
- Should we also expose `getChain()` for accessing chain metadata? (Lean towards yes, but separate issue)
- Document recommended use cases? (Interacting with custom contracts, reading on-chain state)
