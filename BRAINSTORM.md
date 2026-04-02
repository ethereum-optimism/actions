# Issue #302: Return Block Explorer URLs

## Context
Currently, frontend/backend apps must manually construct block explorer URLs for transaction hashes. The SDK should include these URLs in return objects for better DX.

## Problem
- Developers repeat logic to build explorer URLs
- Each chain has different block explorers (Etherscan, Optimistic Etherscan, etc.)
- Easy to make mistakes or use wrong explorer for a chain
- Manual URL construction couples apps to specific explorers

## Current State
**Receipt types:**
- `SwapReceipt` - has `receipt: TransactionReturnType | BatchTransactionReturnType`
- `LendTransactionReceipt` - similar structure
- Both ultimately contain `transactionHash` from viem receipts

**No explorer URL field exists**

## Solution Options

### Option 1: Add `explorerUrl` to Receipt types (Recommended)
Add block explorer URL directly to `SwapReceipt` and `LendTransactionReceipt`:

```typescript
export interface SwapReceipt {
  receipt: TransactionReturnType | BatchTransactionReturnType
  explorerUrl: string // NEW
  // ... existing fields
}
```

**Pros:**
- Simple, obvious location
- Easy to access: `const { explorerUrl } = await wallet.swap()`
- No breaking changes (additive only)

**Cons:**
- Need to generate URL after tx completes
- Requires access to chainId (already available in context)

### Option 2: Add to base receipt types (EOATransactionReceipt, UserOperationTransactionReceipt)
Extend the receipt types themselves.

**Cons:**
- These are viem types, can't modify directly
- Would need wrapper types
- More invasive

### Option 3: Separate helper function
Provide `getExplorerUrl(chainId, txHash)` utility.

**Cons:**
- Doesn't meet requirement (should be in return object)
- Still requires manual construction

## Recommended Approach: Option 1

Add `explorerUrl?: string` to receipt types:
- `SwapReceipt`
- `LendTransactionReceipt`

Make it optional (`?`) for safety — if explorer URL generation fails, don't break the whole transaction.

## Implementation Plan

### 1. Create Explorer URL Utility
**File:** `packages/sdk/src/utils/explorer.ts`

```typescript
import type { SupportedChainId } from '@/constants/supportedChains'

export function getExplorerUrl(chainId: SupportedChainId, txHash: string): string {
  const explorers: Record<SupportedChainId, string> = {
    1: 'https://etherscan.io/tx',
    10: 'https://optimistic.etherscan.io/tx',
    8453: 'https://basescan.org/tx',
    // ... map all supported chains
  }
  
  const baseUrl = explorers[chainId]
  if (!baseUrl) {
    throw new Error(`No explorer configured for chain ${chainId}`)
  }
  
  return `${baseUrl}/${txHash}`
}
```

Better: use viem's chain metadata which already has explorer URLs!

```typescript
import { chainById } from '@eth-optimism/viem/chains'

export function getExplorerUrl(chainId: SupportedChainId, txHash: string): string | undefined {
  const chain = chainById[chainId]
  if (!chain?.blockExplorers?.default) {
    return undefined
  }
  return `${chain.blockExplorers.default.url}/tx/${txHash}`
}
```

### 2. Update Receipt Types
**Files:**
- `packages/sdk/src/types/swap/base.ts`
- `packages/sdk/src/types/lend/base.ts`

Add `explorerUrl?: string` to both receipt interfaces.

### 3. Generate URL in Wallet Namespaces
**Files:**
- `packages/sdk/src/swap/namespaces/WalletSwapNamespace.ts`
- `packages/sdk/src/lend/namespaces/WalletLendNamespace.ts`

After transaction execution, extract `transactionHash` and call `getExplorerUrl(chainId, txHash)`.

### 4. Handle Edge Cases
- UserOperation receipts - also have `transactionHash`
- Batch transactions - multiple tx hashes, return array of URLs?
  - For MVP: use the main receipt's hash
  - Could add `explorerUrls: string[]` for batch case later
- Missing explorer - return undefined gracefully

### 5. Tests
- Unit test: `getExplorerUrl()` for all supported chains
- Integration test: execute swap, verify `explorerUrl` present and valid format
- Test missing explorer (unsupported chain) returns undefined

## Questions
- Should we handle batch transactions specially? (multiple URLs)
  - Initial: use main receipt hash, document limitation
- What if viem chain doesn't have blockExplorer metadata?
  - Return undefined, document that explorer URL is optional
- Should this be in quotes too?
  - Check if quotes have separate return type

## Chain Explorer Mapping
Use viem's `chain.blockExplorers.default.url` - already configured for:
- Ethereum Mainnet → etherscan.io
- Optimism → optimistic.etherscan.io
- Base → basescan.org
- Arbitrum → arbiscan.io
- etc.

Viem chains already have this data, no need to duplicate!
