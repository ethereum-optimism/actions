# Aave Borrow Provider Integration

> **Prerequisites:** This document assumes you've read [borrow-provider-summary.md](./borrow-provider-summary.md) and are familiar with the Actions SDK BorrowProvider pattern.

## Overview

Aave V3 serves as the initial borrow provider for the Actions SDK, enabling collateralized borrowing across Superchain networks. Aave is the largest lending/borrowing protocol on Base and Optimism, providing deep liquidity and battle-tested smart contracts.

**Integration approach:** Direct on-chain contract calls via viem (no external SDK or API dependency).

---

## Aave V3 Protocol Summary

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Pool** | Central contract for all lending/borrowing operations |
| **aTokens** | Interest-bearing tokens representing supplied collateral (e.g., aUSDC) |
| **Debt tokens** | Tokens representing borrow positions (variable or stable) |
| **Health Factor** | Ratio of collateral value to debt; < 1.0 triggers liquidation |
| **LTV** | Loan-to-Value ratio; max percentage of collateral that can be borrowed |
| **Liquidation Threshold** | Collateral ratio at which position becomes liquidatable |
| **Interest Rate Modes** | Variable (fluctuates with utilization) or Stable (fixed-ish rate) |

### Key Contract Functions

| Function | Purpose |
|----------|---------|
| `Pool.borrow()` | Borrow an asset against supplied collateral |
| `Pool.repay()` | Repay borrowed amount (partial or full) |
| `Pool.getUserAccountData()` | Get aggregate position data (collateral, debt, HF, LTV) |
| `Pool.getReserveData()` | Get market data (rates, liquidity, debt tokens) |
| `Pool.getReservesList()` | List all reserve (market) addresses |
| `Pool.setUserUseReserveAsCollateral()` | Enable/disable a supplied asset as collateral |

---

## Contract Addresses

### Aave V3 Pool Addresses

| Network | Chain ID | Pool Address |
|---------|----------|-------------|
| Base | 8453 | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |
| Base Sepolia | 84532 | `0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b` |
| Optimism | 10 | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| OP Sepolia | 11155420 | `0xb50201558B00496A145fE76f7424749556E326D8` |

### Supporting Contracts

| Contract | Base | Base Sepolia |
|----------|------|-------------|
| PoolDataProvider | `0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac` | `0x80f2c50224571826CF3e3B2110cE2098276bD1B4` |
| Oracle | `0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156` | `0x2Da88497588bf726262A9B090EF4134e3f201F09` |
| WETH | `0x4200000000000000000000000000000000000006` | `0x4200000000000000000000000000000000000006` |

---

## BorrowProvider Interface Mapping

The AaveBorrowProvider maps the SDK's abstract interface to Aave V3 contract calls:

### `_execute()` → `Pool.borrow()`

**Parameter Mapping:**

| SDK (BorrowExecuteInternalParams) | Aave Pool.borrow() | Transform |
|-----------------------------------|---------------------|-----------|
| `asset` | `asset` | Resolve address via `getAssetAddress(asset, chainId)` |
| `amountWei` | `amount` | Pass through (already in wei) |
| `rateMode` | `interestRateMode` | `'variable'` → `2`, `'stable'` → `1` |
| N/A | `referralCode` | `0` (no referral) |
| `recipient` | `onBehalfOf` | Pass through |

**Pre-execution checks:**
1. Read `getUserAccountData()` for current health factor and available borrows
2. Verify `availableBorrowsBase >= amountWei` (in base currency terms)
3. Estimate post-borrow health factor
4. Reject if post-borrow HF < configured `minHealthFactor`

**Transaction structure:**
```typescript
{
  to: poolAddress,
  data: encodeFunctionData({
    abi: POOL_ABI,
    functionName: 'borrow',
    args: [assetAddress, amountWei, rateModeInt, 0, recipientAddress],
  }),
  value: 0n,
}
```

---

### `_repay()` → `Pool.repay()`

**Parameter Mapping:**

| SDK (BorrowRepayInternalParams) | Aave Pool.repay() | Transform |
|---------------------------------|---------------------|-----------|
| `asset` | `asset` | Resolve address |
| `amountWei` | `amount` | Pass through; `type(uint256).max` for full repay |
| `rateMode` | `interestRateMode` | `'variable'` → `2`, `'stable'` → `1` |
| `walletAddress` | `onBehalfOf` | Pass through |

**Pre-execution checks:**
1. Check ERC20 allowance of repay token to Pool contract
2. Build approval transaction if allowance insufficient
3. For `'max'` repay, use `type(uint256).max` as amount (Aave handles exact calculation)

**Transaction structure (with approval):**
```typescript
// Approval (if needed)
{
  to: assetAddress,
  data: encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [poolAddress, repayAmount],
  }),
  value: 0n,
}

// Repay
{
  to: poolAddress,
  data: encodeFunctionData({
    abi: POOL_ABI,
    functionName: 'repay',
    args: [assetAddress, repayAmount, rateModeInt, walletAddress],
  }),
  value: 0n,
}
```

**Full repay note:** When `amount: 'max'`, the SDK passes `type(uint256).max` to `Pool.repay()`. Aave's contract internally caps the repayment to the actual debt amount and refunds any excess approval. This avoids the need to read the exact debt balance (which accrues interest between blocks).

---

### `_getPositions()` → `Pool.getUserAccountData()` + reserve iteration

**Data flow:**
1. Call `getUserAccountData(walletAddress)` for aggregate health factor and LTV
2. Call `getReservesList()` to get all reserve addresses
3. For each reserve, call `getUserReserveData(reserve, walletAddress)`
4. Filter reserves where `currentVariableDebt > 0` or `currentStableDebt > 0`
5. For each active debt, read `getReserveData(reserve)` for current rates
6. Build `BorrowPosition` objects with health factor from step 1

**Response mapping:**

```typescript
{
  asset: resolveAsset(reserveAddress),
  collateralAsset: resolveCollateral(accountData),
  debt: userReserveData.currentVariableDebt,  // or currentStableDebt
  debtFormatted: formatUnits(debt, asset.decimals),
  borrowRate: reserveData.currentVariableBorrowRate / 1e27,
  rateMode: 'variable',  // or 'stable'
  collateralValue: accountData.totalCollateralBase,
  ltv: accountData.ltv / 10000,
  healthFactor: accountData.healthFactor / 1e18,
  liquidationThreshold: reserveConfig.liquidationThreshold / 10000,
  provider: 'aave',
}
```

---

### `_getRate()` → `Pool.getReserveData()`

**Response mapping:**

```typescript
{
  variableRate: reserveData.currentVariableBorrowRate / 1e27,
  stableRate: reserveData.currentStableBorrowRate / 1e27,
  availableLiquidity: aTokenBalance - totalDebt,
  availableLiquidityFormatted: formatUnits(availableLiquidity, decimals),
  utilizationRate: totalDebt / (availableLiquidity + totalDebt),
}
```

**Rate precision:** Aave stores rates as ray values (27 decimal places). Divide by `1e27` to get the human-readable APR (e.g., `35000000000000000000000000` → `0.035` → 3.5%).

---

### `_getMarkets()` → Reserve enumeration

**Data flow:**
1. Call `getReservesList()` for all reserve addresses
2. For each reserve, read `getReserveData()` and configuration
3. Decode configuration bitmap for LTV, liquidation threshold, borrowing enabled
4. Filter to only reserves with `borrowingEnabled === true`
5. Build `BorrowMarket` objects

**Configuration bitmap decoding:**

Aave stores reserve configuration as a packed `uint256`. Key fields:

| Bits | Field | Description |
|------|-------|-------------|
| 0-15 | LTV | In basis points (7500 = 75%) |
| 16-31 | Liquidation Threshold | In basis points (8200 = 82%) |
| 32-47 | Liquidation Bonus | In basis points (10500 = 105% = 5% penalty) |
| 48-55 | Decimals | Token decimals |
| 56 | Active | Reserve is active |
| 57 | Frozen | Reserve is frozen (no new supply/borrow) |
| 58 | Borrowing Enabled | Can borrow from this reserve |
| 59 | Stable Rate Enabled | Stable rate borrowing available |

---

## Health Factor Calculation

The health factor determines whether a position is safe or at risk of liquidation:

```
Health Factor = (Total Collateral in Base Currency * Weighted Liquidation Threshold)
                / Total Debt in Base Currency
```

- **HF > 1.0:** Position is safe
- **HF = 1.0:** Position is at liquidation threshold
- **HF < 1.0:** Position can be liquidated

### Post-Borrow Health Factor Estimation

Before executing a borrow, the SDK estimates the resulting health factor:

```typescript
function estimatePostBorrowHealthFactor(
  currentCollateralBase: bigint,
  currentDebtBase: bigint,
  currentLiquidationThreshold: bigint,
  newBorrowAmountBase: bigint
): number {
  const newDebtBase = currentDebtBase + newBorrowAmountBase
  if (newDebtBase === 0n) return Infinity

  const weightedThreshold = currentCollateralBase * currentLiquidationThreshold / 10000n
  return Number(weightedThreshold * BigInt(1e18) / newDebtBase) / 1e18
}
```

**Safety guardrail:** The SDK's `minHealthFactor` config (default: 1.0) prevents borrows that would result in a health factor below the threshold. A conservative default of 1.2-1.5 is recommended to provide a buffer against price movements.

---

## Supported Assets on Base Sepolia

| Asset | Address | LTV | Liq. Threshold | Borrow Enabled |
|-------|---------|-----|----------------|----------------|
| WETH | `0x4200000000000000000000000000000000000006` | 80% | 82.5% | Yes |
| USDC | `0x...` (testnet) | 77% | 80% | Yes |
| DAI | `0x...` (testnet) | 75% | 78% | Yes |
| WBTC | `0x...` (testnet) | 73% | 78% | Yes |

*Note: Testnet asset addresses may differ from mainnet. Check [Aave testnet deployments](https://docs.aave.com/developers/deployed-contracts) for current addresses.*

---

## Implementation Considerations

### 1. Collateral Enablement

When a user supplies an asset via `wallet.lend.supply()`, the asset may need to be explicitly enabled as collateral via `Pool.setUserUseReserveAsCollateral()`. In Aave V3, newly supplied assets are enabled as collateral by default if the asset supports it.

**Recommendation:** Before executing a borrow, verify the collateral asset is enabled. If not, include a `setUserUseReserveAsCollateral(asset, true)` call in the batch transaction.

### 2. E-Mode (Efficiency Mode)

Aave V3 supports E-Mode for correlated asset pairs (e.g., ETH/stETH), allowing higher LTV ratios. This is out of scope for the initial implementation but should be considered for future versions.

### 3. Isolation Mode

Some assets in Aave V3 are in isolation mode, which restricts them as collateral and limits which assets can be borrowed. The SDK should check for isolation mode restrictions and provide clear error messages.

### 4. Stable Rate Deprecation

Aave governance has been moving toward deprecating stable rate borrowing on many markets. The SDK should handle cases where `stableRateEnabled === false` gracefully and default to variable rate.

### 5. Oracle Price Feeds

Aave uses Chainlink oracles for price feeds. The SDK does not need to interact with oracles directly - prices are used internally by the Pool contract for health factor and LTV calculations.

### 6. Native ETH Handling

For borrowing native ETH:
- Aave V3 uses WETH internally
- Use the WrappedTokenGateway contract for ETH borrow/repay operations
- The SDK should abstract this away, allowing users to specify ETH as the borrow asset

---

## Developer Setup

```typescript
import { createActions, ETH, USDC } from '@eth-optimism/actions-sdk'

const actions = createActions({
  wallet: { /* ... */ },
  chains: [{ chainId: 84532, rpcUrl: '...' }],

  // Enable lending (for supplying collateral)
  lend: {
    aave: {},
  },

  // Enable borrowing
  borrow: {
    aave: {
      minHealthFactor: 1.5,     // Conservative - reject borrows below 1.5 HF
      maxLtv: 0.65,             // Cap LTV at 65% (below Aave's 80% for ETH)
      collateralAllowlist: [     // Only allow ETH as collateral
        { asset: ETH, chainId: 84532 },
      ],
      assetAllowlist: [          // Only allow USDC borrowing
        { asset: USDC, chainId: 84532 },
      ],
    },
  },
})

// Supply collateral
const wallet = await actions.wallet.getSmartWallet({ signer })
await wallet.lend.supply({ asset: ETH, amount: 2.0, chainId: 84532 })

// Check rates
const rates = await actions.borrow.rates({ asset: USDC, chainId: 84532 })
console.log(`Variable rate: ${(rates[0].variableRate * 100).toFixed(2)}%`)

// Borrow
const receipt = await wallet.borrow.execute({
  asset: USDC,
  amount: 1000,
  collateralAsset: ETH,
  chainId: 84532,
})

console.log(`Health factor: ${receipt.healthFactor.toFixed(2)}`)

// Repay
await wallet.borrow.repay({
  asset: USDC,
  amount: 'max',
  chainId: 84532,
})
```

---

## Comparison: Aave vs Compound

| Feature | Aave V3 | Compound V3 |
|---------|---------|-------------|
| **Architecture** | Multi-asset pools | Isolated market per base asset |
| **Rate Modes** | Variable + Stable | Variable only |
| **E-Mode** | Yes (higher LTV for correlated assets) | No |
| **Isolation Mode** | Yes | Yes (by design) |
| **Chain Support** | Base, Optimism, Ethereum, + more | Base, Optimism, Ethereum |
| **Oracle** | Chainlink | Chainlink |
| **Flash Loans** | Yes | No |
| **Governance** | AAVE token | COMP token |

**Recommendation:** Aave V3 is the preferred initial provider due to its wider Superchain deployment, multi-asset pool architecture (better capital efficiency for users with diverse collateral), and support for both variable and stable rates.

---

## Integration Requirements

### 1. Contract Interactions

All interactions are direct on-chain calls via viem `readContract` and `writeContract`. No external APIs or SDKs required.

### 2. Gas Optimization

- Batch approval + borrow in a single transaction via `wallet.sendBatch()`
- Use `type(uint256).max` for full repay to avoid read-before-write
- Cache `getReservesList()` results (reserves rarely change)

### 3. Error Handling

| Aave Error | SDK Handling |
|------------|--------------|
| `HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD` | Pre-check health factor before submitting |
| `COLLATERAL_CANNOT_COVER_NEW_BORROW` | Check `availableBorrowsBase` first |
| `STABLE_BORROWING_NOT_ENABLED` | Fall back to variable rate with warning |
| `NO_DEBT_OF_SELECTED_TYPE` | Return clear "no debt to repay" message |
| `BORROWING_NOT_ENABLED` | Filter from `getMarkets()` results |

### 4. Rate Conversion

Aave rates are in ray (27 decimals):
- `currentVariableBorrowRate / 1e27` = APR as decimal (e.g., 0.035 = 3.5%)
- To get APY: `(1 + rate/secondsPerYear)^secondsPerYear - 1`

---

## Resources

- **Aave V3 Docs:** https://docs.aave.com/developers
- **Aave V3 Deployments:** https://docs.aave.com/developers/deployed-contracts
- **Aave V3 Pool Contract:** https://docs.aave.com/developers/core-contracts/pool
- **Aave Risk Parameters:** https://docs.aave.com/risk/asset-risk/risk-parameters
- **Actions SDK Repo:** https://github.com/ethereum-optimism/actions
- **Borrow Provider Spec:** [borrow-provider-summary.md](./borrow-provider-summary.md)
