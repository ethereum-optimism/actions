# ETH vs WETH Issue - Analysis & Solutions

## Problem Confirmed

**Issue**: When trying to lend to WETH markets (like Aave WETH on OP Sepolia at `0x4200000000000000000000000000000000000006`), the transaction fails with:
```
Error: Asset not found for token address: 0x4200000000000000000000000000000000000006
```

**Root Cause**:
1. Users have **native ETH** in their wallet (shown as "ETH" balance)
2. The WETH market expects **WETH** (Wrapped ETH) - an ERC-20 token
3. SDK's `SUPPORTED_TOKENS` only has ETH (native), not WETH
4. Backend service fails when it can't find WETH in the supported tokens list

**Contract Address**: `0x4200000000000000000000000000000000000006` is the canonical WETH address on OP Sepolia (predeploy).

## Current State

### What We Have:
- ✅ SDK fetches WETH markets from Aave
- ✅ UI shows WETH markets with native ETH balance (via special case in `balanceMatching.ts`)
- ✅ Users can see their ETH balance when WETH market is selected
- ❌ Deposits fail because backend expects WETH token in `SUPPORTED_TOKENS`

### Aave Capabilities:
- ✅ Aave V3 **does** support automatic ETH→WETH wrapping via `WETHGateway` contract
- ✅ `depositETH()` function wraps ETH and deposits in one transaction
- ❌ Our SDK's Aave provider uses `Pool.supply()` directly, not `WETHGateway`

## Proposed Solutions

### Option 1: Add WETH to SUPPORTED_TOKENS (Simplest - Recommended)

**Approach**: Add WETH as a supported ERC-20 token, then implement wrapping logic.

**Changes Needed**:

1. **Add WETH to SDK** (`packages/sdk/src/supported/tokens.ts`):
```typescript
{
  address: {
    [mainnet.id]: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    [base.id]: '0x4200000000000000000000000000000000000006',
    [baseSepolia.id]: '0x4200000000000000000000000000000000000006',
    [optimismSepolia.id]: '0x4200000000000000000000000000000000000006',
    [unichain.id]: '0x4200000000000000000000000000000000000006',
  },
  metadata: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
  },
  type: 'erc20',
}
```

2. **Add wrap helper in SDK** (new file `packages/sdk/src/utils/weth.ts`):
```typescript
/**
 * Wrap native ETH to WETH
 * @param amount - Amount in wei to wrap
 * @param chainId - Chain ID
 * @param walletAddress - User's wallet address
 * @returns Transaction data for wrapping
 */
export function createWrapTransaction(
  amount: bigint,
  chainId: SupportedChainId,
  walletAddress: Address,
): TransactionData {
  const wethAddress = getTokenAddress('WETH', chainId)
  if (!wethAddress) {
    throw new Error(`WETH not supported on chain ${chainId}`)
  }

  return {
    to: wethAddress,
    value: amount,
    data: encodeFunctionData({
      abi: parseAbi(['function deposit() payable']),
      functionName: 'deposit',
    }),
  }
}
```

3. **Auto-wrap in openPosition** - Check if depositing to WETH market with ETH balance:
```typescript
// In AaveLendProvider._openPosition()
const transactionData = []

// If asset is WETH and we're depositing, add wrap tx first
if (params.asset.metadata.symbol === 'WETH') {
  const wrapTx = createWrapTransaction(
    params.amountWei,
    params.marketId.chainId,
    params.walletAddress,
  )
  transactionData.push(wrapTx)
}

// Then add approval + supply
transactionData.push(approvalTx, supplyTx)
```

**Pros**:
- ✅ Works with existing `Pool.supply()` - no need for WETHGateway
- ✅ Simpler - just add token config and wrap helper
- ✅ Works for both Aave and Morpho (both expect WETH)
- ✅ User sees clear transaction steps (wrap → approve → supply)

**Cons**:
- Requires 3 transactions per deposit (wrap, approve, supply)
- Slightly higher gas costs

---

### Option 2: Use Aave's WETHGateway

**Approach**: Use Aave's built-in WETHGateway contract for automatic wrapping.

**Changes Needed**:

1. **Add WETHGateway addresses** to `packages/sdk/src/lend/providers/aave/addresses.ts`
2. **Update AaveLendProvider** to detect WETH markets and use `depositETH()` instead of `supply()`
3. **Add special case** in `_openPosition()`:
```typescript
if (isWETHMarket) {
  // Use WETHGateway.depositETH() - sends ETH directly
  const depositData = encodeFunctionData({
    abi: WETH_GATEWAY_ABI,
    functionName: 'depositETH',
    args: [poolAddress, params.walletAddress, 0], // referralCode = 0
  })

  return {
    transactionData: [{
      to: wethGatewayAddress,
      value: params.amountWei, // Send ETH as value
      data: depositData,
    }]
  }
}
```

**Pros**:
- ✅ Single transaction (wrap + deposit combined)
- ✅ Lower gas costs
- ✅ Native Aave feature - battle-tested

**Cons**:
- ❌ Only works for Aave, not Morpho
- ❌ Need to maintain WETHGateway addresses for each chain
- ❌ More complex - two different code paths for WETH vs other assets
- ❌ Still need to add WETH to `SUPPORTED_TOKENS` for withdrawals

---

### Option 3: Frontend Auto-Wrap (UX-Focused)

**Approach**: Wrap ETH → WETH in frontend before calling deposit.

**Changes Needed**:

1. **Add WETH to `SUPPORTED_TOKENS`** (same as Option 1)
2. **Add wrap button/flow in UI**:
   - Show "You have X ETH, this market requires WETH" message
   - Provide "Wrap ETH" button
   - After wrap completes, show new WETH balance
   - Then allow deposit

3. **OR auto-wrap** silently:
```typescript
// In handleTransaction()
if (marketData.asset.metadata.symbol === 'WETH' && userHasOnlyETH) {
  // Step 1: Wrap ETH → WETH
  await wallet.sendTransaction(createWrapTransaction(...))

  // Step 2: Deposit WETH
  await wallet.lend.openPosition(...)
}
```

**Pros**:
- ✅ User sees clear steps in UI
- ✅ Can wrap exact amount needed or entire balance
- ✅ Works for all providers (Aave, Morpho, future ones)

**Cons**:
- ❌ Two separate user transactions
- ❌ User must approve twice (once for wrap, once for deposit)
- ❌ More complex UX flow

---

## Recommendation: **Option 1** (Add WETH + Auto-Wrap)

**Why**:
1. **Works everywhere** - Aave, Morpho, any future providers
2. **Simplest implementation** - Just add token config + wrap helper
3. **Transparent** - User sees all steps in transaction log
4. **Future-proof** - WETH is standard across all EVM chains
5. **No special cases** - Same flow for all ERC-20 deposits

**Implementation Steps**:
1. Add WETH to `SUPPORTED_TOKENS` (5 min)
2. Create `weth.ts` helper with wrap function (10 min)
3. Update both Aave and Morpho providers to auto-wrap when needed (20 min)
4. Test on OP Sepolia (5 min)
5. Update UI to show wrap step in activity log (optional, 10 min)

**Total**: ~50 minutes of work

---

## Alternative: Keep Current UX (Show ETH for WETH Markets)

If we want to keep showing "ETH" balance for WETH markets (current behavior):

**Do**:
- Still add WETH to `SUPPORTED_TOKENS`
- Auto-wrap ETH → WETH before deposits
- Keep UI showing "ETH" for better UX

**Don't**:
- Don't change the balance display logic in `balanceMatching.ts`
- User doesn't need to know about WETH wrapping

This gives best UX - user thinks they're depositing ETH directly, but we handle the wrapping behind the scenes.
