# Implementation Plan: Block Explorer URLs (#302)

## Overview
Add `explorerUrl` field to swap and lend receipt types, automatically populated with block explorer URL for the transaction.

## Tasks

### 1. Create Explorer Utility
**File:** `packages/sdk/src/utils/explorer.ts` (new file)

```typescript
import { chainById } from '@eth-optimism/viem/chains'
import type { SupportedChainId } from '@/constants/supportedChains.js'

/**
 * Get block explorer URL for a transaction
 * @param chainId - Chain ID
 * @param txHash - Transaction hash
 * @returns Explorer URL or undefined if chain has no configured explorer
 */
export function getExplorerUrl(
  chainId: SupportedChainId,
  txHash: string,
): string | undefined {
  const chain = chainById[chainId]
  const explorerUrl = chain?.blockExplorers?.default?.url
  
  if (!explorerUrl) {
    return undefined
  }
  
  return `${explorerUrl}/tx/${txHash}`
}
```

**Test file:** `packages/sdk/src/utils/__tests__/explorer.test.ts`
- Test Ethereum mainnet → etherscan.io
- Test Optimism → optimistic.etherscan.io  
- Test Base → basescan.org
- Test format: URL + `/tx/` + hash

### 2. Update Swap Receipt Type
**File:** `packages/sdk/src/types/swap/base.ts`

Add to `SwapReceipt` interface:
```typescript
export interface SwapReceipt {
  receipt: TransactionReturnType | BatchTransactionReturnType
  /** Block explorer URL for the transaction (if available) */
  explorerUrl?: string
  // ... existing fields
}
```

### 3. Update Lend Receipt Type
**File:** `packages/sdk/src/types/lend/base.ts`

Check current `LendTransactionReceipt` structure and add:
```typescript
explorerUrl?: string
```

### 4. Generate URL in Swap Namespace
**File:** `packages/sdk/src/swap/namespaces/WalletSwapNamespace.ts`

In the method that returns `SwapReceipt`, after getting the receipt:
1. Extract `transactionHash` from receipt
2. Call `getExplorerUrl(chainId, transactionHash)`
3. Add to return object

### 5. Generate URL in Lend Namespace  
**File:** `packages/sdk/src/lend/namespaces/WalletLendNamespace.ts`

Similar to swap - find where `LendTransactionReceipt` is constructed and add `explorerUrl`.

### 6. Integration Tests
Add tests to existing namespace test files:
- Swap: verify `explorerUrl` present after swap execution
- Lend: verify `explorerUrl` present after lend transaction

## Files to Create
1. `packages/sdk/src/utils/explorer.ts`
2. `packages/sdk/src/utils/__tests__/explorer.test.ts`

## Files to Modify
1. `packages/sdk/src/types/swap/base.ts` - Add `explorerUrl?` to `SwapReceipt`
2. `packages/sdk/src/types/lend/base.ts` - Add `explorerUrl?` to `LendTransactionReceipt`
3. `packages/sdk/src/swap/namespaces/WalletSwapNamespace.ts` - Generate URL
4. `packages/sdk/src/lend/namespaces/WalletLendNamespace.ts` - Generate URL

## Edge Cases
- **UserOperation receipts**: Also have `transactionHash`, same approach works
- **Batch transactions**: Use main receipt's hash (document limitation)
- **Missing explorer**: Return undefined (optional field)
- **Invalid hash**: viem guarantees valid format, no extra validation needed

## Testing Strategy
- Unit test the utility function for various chains
- Mock tests for namespace URL generation
- External/network test: verify real URL format (if applicable)

## Success Criteria
- ✅ `SwapReceipt` includes valid `explorerUrl`
- ✅ `LendTransactionReceipt` includes valid `explorerUrl`  
- ✅ URL format: `{explorer_base}/tx/{hash}`
- ✅ Graceful handling when explorer unavailable (undefined)
- ✅ All tests pass
- ✅ Build + lint clean
