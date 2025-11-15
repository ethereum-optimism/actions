# Aave WETHGateway Implementation Proposal

## Overview

Use Aave's native `WETHGateway.depositETH()` for WETH markets instead of the standard `Pool.supply()` flow. This provides a single-transaction solution for depositing native ETH into WETH markets.

## Changes Required

### 1. Add WETHGateway Addresses

**File**: `packages/sdk/src/lend/providers/aave/addresses.ts`

```typescript
/**
 * Aave V3 WETHGateway addresses for Optimism Superchain networks
 * @description Gateway contracts that handle native ETH wrapping and depositing
 */

/**
 * Mainnet WETHGateway addresses
 */
export const WETH_GATEWAY_ADDRESSES_MAINNET: Record<number, Address> = {
  // Optimism Mainnet
  10: '0x5f2508cAE9923b02316254026CD43d7902866725',
  // Base Mainnet
  8453: '0xa0d9C1E9E48Ca30c8d8C3B5D69FF5dc1f6DFfC24',
} as const

/**
 * Testnet WETHGateway addresses
 */
export const WETH_GATEWAY_ADDRESSES_TESTNET: Record<number, Address> = {
  // Optimism Sepolia
  11155420: '0x589750BA8aF186cE5B55391B0b7148cAD43a1619',
  // Base Sepolia
  84532: '0x0568130e794429D2eEBC4dafE18f25Ff1a1ed8b6',
} as const

/**
 * All WETHGateway addresses (mainnet + testnet)
 */
export const WETH_GATEWAY_ADDRESSES: Record<number, Address> = {
  ...WETH_GATEWAY_ADDRESSES_MAINNET,
  ...WETH_GATEWAY_ADDRESSES_TESTNET,
} as const

/**
 * Get WETHGateway address for a given chain ID
 * @param chainId - Chain ID
 * @returns WETHGateway address if supported, undefined otherwise
 */
export function getWETHGatewayAddress(chainId: number): Address | undefined {
  return WETH_GATEWAY_ADDRESSES[chainId]
}
```

### 2. Add WETHGateway ABI

**File**: `packages/sdk/src/lend/providers/aave/AaveLendProvider.ts`

```typescript
import { encodeFunctionData, erc20Abi, formatUnits, parseAbi } from 'viem'

/**
 * Aave Pool ABI - only the functions we need
 */
const POOL_ABI = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
])

/**
 * Aave WETHGateway ABI - for native ETH deposits/withdrawals
 */
const WETH_GATEWAY_ABI = parseAbi([
  'function depositETH(address pool, address onBehalfOf, uint16 referralCode) payable',
  'function withdrawETH(address pool, uint256 amount, address to)',
])
```

### 3. Detect WETH Markets

**File**: `packages/sdk/src/lend/providers/aave/AaveLendProvider.ts`

```typescript
/**
 * Check if market is a WETH market
 * @param marketId - Market identifier
 * @returns true if market is for WETH
 */
private isWETHMarket(marketId: LendMarketId): boolean {
  // OP Sepolia WETH: 0x4200000000000000000000000000000000000006
  // Base Sepolia WETH: 0x4200000000000000000000000000000000000006
  // OP Mainnet WETH: 0x4200000000000000000000000000000000000006
  // Base Mainnet WETH: 0x4200000000000000000000000000000000000006
  // WETH is a predeploy at same address on all OP Stack chains
  const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'

  return marketId.address.toLowerCase() === WETH_ADDRESS.toLowerCase()
}
```

### 4. Update `_openPosition()` Logic

**File**: `packages/sdk/src/lend/providers/aave/AaveLendProvider.ts`

```typescript
protected async _openPosition(
  params: LendOpenPositionInternalParams,
): Promise<LendTransaction> {
  try {
    // Get Pool address for this chain
    const poolAddress = getPoolAddress(params.marketId.chainId)
    if (!poolAddress) {
      throw new Error(
        `Aave V3 not deployed on chain ${params.marketId.chainId}`,
      )
    }

    // Get market information for APY
    const marketInfo = await this.getMarket({
      address: params.marketId.address,
      chainId: params.marketId.chainId,
    })

    // **NEW: Check if this is a WETH market**
    if (this.isWETHMarket(params.marketId)) {
      return this._openWETHPosition(params, poolAddress, marketInfo)
    }

    // **EXISTING: Standard ERC-20 flow**
    return this._openERC20Position(params, poolAddress, marketInfo)
  } catch (error) {
    throw new Error(`Failed to open position: ${error}`)
  }
}

/**
 * Open position for WETH market using WETHGateway
 * @description Deposits native ETH via WETHGateway which wraps and deposits in one tx
 */
private async _openWETHPosition(
  params: LendOpenPositionInternalParams,
  poolAddress: Address,
  marketInfo: LendMarket,
): Promise<LendTransaction> {
  const gatewayAddress = getWETHGatewayAddress(params.marketId.chainId)
  if (!gatewayAddress) {
    throw new Error(
      `WETHGateway not available on chain ${params.marketId.chainId}`,
    )
  }

  // Generate depositETH transaction
  const depositCallData = encodeFunctionData({
    abi: WETH_GATEWAY_ABI,
    functionName: 'depositETH',
    args: [
      poolAddress,           // pool address
      params.walletAddress,  // onBehalfOf (receives aWETH)
      0,                     // referralCode (0 = no referral)
    ],
  })

  return {
    transactionData: [
      {
        to: gatewayAddress,
        value: params.amountWei, // Send ETH as msg.value
        data: depositCallData,
      },
    ],
    chainId: params.marketId.chainId,
    assetSymbol: 'ETH', // User is depositing ETH
    assetAmount: params.amountWei,
    assetAmountFormatted: formatUnits(params.amountWei, 18),
    marketName: marketInfo.name,
    apy: marketInfo.apy.total,
  }
}

/**
 * Open position for standard ERC-20 tokens
 * @description Standard approve + supply flow for non-WETH assets
 */
private async _openERC20Position(
  params: LendOpenPositionInternalParams,
  poolAddress: Address,
  marketInfo: LendMarket,
): Promise<LendTransaction> {
  // Get asset address for the chain
  const assetAddress = params.asset.address[params.marketId.chainId]
  if (!assetAddress) {
    throw new Error(
      `Asset not supported on chain ${params.marketId.chainId}`,
    )
  }

  // Generate approval transaction
  const approvalCallData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [poolAddress, params.amountWei],
  })

  // Generate supply transaction
  const supplyCallData = encodeFunctionData({
    abi: POOL_ABI,
    functionName: 'supply',
    args: [
      assetAddress,          // asset
      params.amountWei,      // amount
      params.walletAddress,  // onBehalfOf
      0,                     // referralCode
    ],
  })

  return {
    transactionData: [
      {
        to: assetAddress,
        value: 0n,
        data: approvalCallData,
      },
      {
        to: poolAddress,
        value: 0n,
        data: supplyCallData,
      },
    ],
    chainId: params.marketId.chainId,
    assetSymbol: params.asset.metadata.symbol,
    assetAmount: params.amountWei,
    assetAmountFormatted: formatUnits(
      params.amountWei,
      params.asset.metadata.decimals,
    ),
    marketName: marketInfo.name,
    apy: marketInfo.apy.total,
  }
}
```

### 5. Update `_closePosition()` for WETH

**File**: `packages/sdk/src/lend/providers/aave/AaveLendProvider.ts`

```typescript
protected async _closePosition(
  params: LendClosePositionParams,
): Promise<LendTransaction> {
  try {
    const poolAddress = getPoolAddress(params.marketId.chainId)
    if (!poolAddress) {
      throw new Error(
        `Aave V3 not deployed on chain ${params.marketId.chainId}`,
      )
    }

    const marketInfo = await this.getMarket({
      address: params.marketId.address,
      chainId: params.marketId.chainId,
    })

    // **NEW: Check if this is a WETH market**
    if (this.isWETHMarket(params.marketId)) {
      return this._closeWETHPosition(params, poolAddress, marketInfo)
    }

    // **EXISTING: Standard ERC-20 flow**
    return this._closeERC20Position(params, poolAddress, marketInfo)
  } catch (error) {
    throw new Error(`Failed to close position: ${error}`)
  }
}

/**
 * Close position for WETH market using WETHGateway
 * @description Withdraws aWETH, unwraps to ETH, and sends to user
 */
private async _closeWETHPosition(
  params: LendClosePositionParams,
  poolAddress: Address,
  marketInfo: LendMarket,
): Promise<LendTransaction> {
  const gatewayAddress = getWETHGatewayAddress(params.marketId.chainId)
  if (!gatewayAddress) {
    throw new Error(
      `WETHGateway not available on chain ${params.marketId.chainId}`,
    )
  }

  // First: User must approve aWETH to WETHGateway
  // aWETH token address is the same as market address for Aave
  const aWETHAddress = params.marketId.address

  const approvalCallData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [gatewayAddress, params.amountWei],
  })

  // Second: Call withdrawETH on gateway
  const withdrawCallData = encodeFunctionData({
    abi: WETH_GATEWAY_ABI,
    functionName: 'withdrawETH',
    args: [
      poolAddress,          // pool
      params.amountWei,     // amount
      params.walletAddress, // to (receives native ETH)
    ],
  })

  return {
    transactionData: [
      {
        to: aWETHAddress,
        value: 0n,
        data: approvalCallData,
      },
      {
        to: gatewayAddress,
        value: 0n,
        data: withdrawCallData,
      },
    ],
    chainId: params.marketId.chainId,
    assetSymbol: 'ETH', // User receives ETH
    assetAmount: params.amountWei,
    assetAmountFormatted: formatUnits(params.amountWei, 18),
    marketName: marketInfo.name,
    apy: marketInfo.apy.total,
  }
}

/**
 * Close position for standard ERC-20 tokens
 */
private async _closeERC20Position(
  params: LendClosePositionParams,
  poolAddress: Address,
  marketInfo: LendMarket,
): Promise<LendTransaction> {
  const assetAddress = params.asset.address[params.marketId.chainId]
  if (!assetAddress) {
    throw new Error(
      `Asset not supported on chain ${params.marketId.chainId}`,
    )
  }

  const withdrawCallData = encodeFunctionData({
    abi: POOL_ABI,
    functionName: 'withdraw',
    args: [assetAddress, params.amountWei, params.walletAddress],
  })

  return {
    transactionData: [
      {
        to: poolAddress,
        value: 0n,
        data: withdrawCallData,
      },
    ],
    chainId: params.marketId.chainId,
    assetSymbol: params.asset.metadata.symbol,
    assetAmount: params.amountWei,
    assetAmountFormatted: formatUnits(
      params.amountWei,
      params.asset.metadata.decimals,
    ),
    marketName: marketInfo.name,
    apy: marketInfo.apy.total,
  }
}
```

## Benefits

✅ **Single transaction** for WETH deposits (vs 3 with manual wrap)
✅ **Lower gas costs** - one tx instead of three
✅ **Native Aave feature** - battle-tested, officially supported
✅ **Clean UX** - user deposits "ETH", receives "aWETH", withdraws "ETH"
✅ **No WETH in SUPPORTED_TOKENS** needed - we handle it as ETH
✅ **Automatic unwrap** on withdraw - user gets native ETH back

## Transaction Flows

### Deposit Flow (WETH Market)
1. User: "Lend 0.1 ETH"
2. SDK: Calls `WETHGateway.depositETH{value: 0.1 ETH}()`
3. Gateway: Wraps 0.1 ETH → 0.1 WETH, deposits to Pool
4. Result: User receives 0.1 aWETH

### Withdraw Flow (WETH Market)
1. User: "Withdraw 0.1 ETH"
2. SDK: Approves aWETH to gateway, calls `WETHGateway.withdrawETH()`
3. Gateway: Burns 0.1 aWETH, unwraps 0.1 WETH → 0.1 ETH, sends to user
4. Result: User receives 0.1 native ETH

### Deposit Flow (Non-WETH, e.g., USDC)
1. User: "Lend 100 USDC"
2. SDK: Approves USDC to Pool, calls `Pool.supply()`
3. Result: User receives aUSDC

## Edge Cases Handled

1. **WETH not available**: Check `getWETHGatewayAddress()`, fallback error
2. **Non-WETH assets**: Use standard `Pool.supply()` flow
3. **Chain not supported**: Error before attempting transaction
4. **WETH is predeploy**: Same address on all OP Stack chains (`0x4200...0006`)

## Files Changed

1. `packages/sdk/src/lend/providers/aave/addresses.ts` - Add gateway addresses
2. `packages/sdk/src/lend/providers/aave/AaveLendProvider.ts` - Update deposit/withdraw logic

**Total Changes**: ~200 lines added across 2 files

## Testing

Test on OP Sepolia:
1. Select WETH market
2. Try to deposit ETH → should succeed with 1 transaction
3. Verify aWETH balance increases
4. Withdraw → should receive native ETH back

## Notes

- WETH address `0x4200000000000000000000000000000000000006` is consistent across all OP Stack chains (Optimism, Base, etc.)
- WETHGateway is deployed on all chains where Aave V3 exists
- This approach keeps the UI simple - user always sees "ETH" not "WETH"
