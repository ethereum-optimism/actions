# BorrowProvider API Specification

## Overview

The Actions SDK enables embedded wallet integrations to connect with DeFi actions including Lend, Borrow, Swap, and Pay. This specification defines the **BorrowProvider** feature for collateralized borrowing, with Aave as the initial implementation.

The SDK uses an **adapter pattern** that supports multiple borrow providers. Developers configure which providers to enable, and the SDK handles collateral management, health factor monitoring, approvals, and transaction execution transparently.

Borrowing is the complement to lending: users deposit collateral assets and borrow other assets against that collateral. The BorrowProvider follows the same architecture as LendProvider and SwapProvider for consistency.

---

## Common Types

### Asset

An `Asset` is an object representing a token with its addresses across different chains and metadata:

```typescript
interface Asset {
  /** Token addresses by chain ID */
  address: Record<number, Address>
  /** Token metadata */
  metadata: {
    name: string
    symbol: string
    decimals: number
  }
  /** Token type (erc20 or native) */
  type: 'erc20' | 'native'
}
```

---

## Wallet Namespace API

### `wallet.borrow.execute(params)`

Borrow an asset against deposited collateral.

```typescript
const receipt = await wallet.borrow.execute({
  asset: USDC,              // Asset to borrow
  amount: 1000,             // Human-readable amount (e.g., 1000 USDC)
  collateralAsset: ETH,     // Collateral asset (must already be supplied)
  chainId: 84532,
})
```

**Parameters:**

```typescript
interface BorrowExecuteParams {
  /** Asset to borrow */
  asset: Asset
  /** Amount to borrow (human-readable, e.g., 1000 for 1000 USDC) */
  amount: number
  /** Collateral asset backing the borrow position. Must already be supplied or supplied in the same transaction. */
  collateralAsset: Asset
  /** Chain to execute borrow on */
  chainId: number
  /** Interest rate mode: 'variable' (default) or 'stable' (if supported) */
  rateMode?: 'variable' | 'stable'
  /** Recipient of borrowed funds. Defaults to wallet address. */
  recipient?: Address
}
```

**Returns:** `BorrowReceipt`

```typescript
interface BorrowReceipt {
  receipt: TransactionReceipt    // Blockchain transaction receipt
  amount: bigint                 // Actual borrowed amount (wei)
  amountFormatted: string        // Human-readable borrowed amount
  asset: Asset                   // Borrowed asset
  collateralAsset: Asset         // Collateral asset
  rateMode: 'variable' | 'stable'
  borrowRate: number             // Current borrow APR (0.05 = 5%)
  healthFactor: number           // Post-borrow health factor
}
```

---

### `wallet.borrow.repay(params)`

Repay a borrow position partially or in full.

```typescript
const receipt = await wallet.borrow.repay({
  asset: USDC,
  amount: 500,            // Partial repay
  chainId: 84532,
})

// Full repay
const receipt = await wallet.borrow.repay({
  asset: USDC,
  amount: 'max',          // Repay entire position
  chainId: 84532,
})
```

**Parameters:**

```typescript
interface BorrowRepayParams {
  /** Asset to repay */
  asset: Asset
  /** Amount to repay (human-readable) or 'max' for full repay */
  amount: number | 'max'
  /** Chain to execute repay on */
  chainId: number
  /** Interest rate mode of the position to repay */
  rateMode?: 'variable' | 'stable'
}
```

**Returns:** `BorrowRepayReceipt`

```typescript
interface BorrowRepayReceipt {
  receipt: TransactionReceipt
  amount: bigint                 // Actual repaid amount (wei)
  amountFormatted: string        // Human-readable repaid amount
  asset: Asset
  remainingDebt: bigint          // Remaining debt (wei)
  remainingDebtFormatted: string // Human-readable remaining debt
  healthFactor: number           // Post-repay health factor
}
```

---

### `wallet.borrow.positions(params)` / `actions.borrow.positions(params)`

Get current borrow positions for a wallet. Available on both `wallet.borrow` and `actions.borrow`.

```typescript
const positions = await wallet.borrow.positions({
  chainId: 84532,
})
```

**Parameters:**

```typescript
interface BorrowPositionsParams {
  /** Chain to query positions on */
  chainId: number
  /** Filter by borrowed asset (optional) */
  asset?: Asset
}
```

**Returns:** `BorrowPosition[]`

```typescript
interface BorrowPosition {
  /** Borrowed asset */
  asset: Asset
  /** Collateral asset */
  collateralAsset: Asset
  /** Current debt amount (wei) */
  debt: bigint
  /** Human-readable debt */
  debtFormatted: string
  /** Current borrow APR (0.05 = 5%) */
  borrowRate: number
  /** Interest rate mode */
  rateMode: 'variable' | 'stable'
  /** Collateral value (wei, in borrow asset terms) */
  collateralValue: bigint
  /** Loan-to-value ratio (0.75 = 75%) */
  ltv: number
  /** Health factor (< 1.0 means liquidatable) */
  healthFactor: number
  /** Liquidation threshold (0.82 = 82%) */
  liquidationThreshold: number
  /** Provider name */
  provider: string
}
```

---

## Actions Namespace API

### `actions.borrow.rates(params)`

Get current borrow rates across ALL configured providers. Available on `actions.borrow` (no wallet required).

```typescript
const rates = await actions.borrow.rates({
  asset: USDC,
  chainId: 84532,
})

// Returns rates from all providers
console.log(rates[0].provider)        // "aave"
console.log(rates[0].variableRate)    // 0.035 (3.5%)
console.log(rates[1].provider)        // "compound"
console.log(rates[1].variableRate)    // 0.042 (4.2%)
```

**Parameters:**

```typescript
interface BorrowRateParams {
  /** Asset to get borrow rate for */
  asset: Asset
  /** Chain to get rate on */
  chainId: number
}
```

**Returns:** `BorrowRateWithProvider[]` (sorted by lowest rate)

```typescript
interface BorrowRate {
  /** Current variable borrow APR (0.05 = 5%) */
  variableRate: number
  /** Current stable borrow APR, if supported */
  stableRate?: number
  /** Available liquidity to borrow (wei) */
  availableLiquidity: bigint
  /** Available liquidity (human-readable) */
  availableLiquidityFormatted: string
  /** Utilization rate of the market (0.80 = 80%) */
  utilizationRate: number
}

interface BorrowRateWithProvider extends BorrowRate {
  /** Provider name that returned this rate (e.g., 'aave', 'compound') */
  provider: string
}
```

---

### `actions.borrow.getMarkets(params)`

Get available borrow markets across ALL configured providers.

```typescript
// Get all USDC borrow markets
const markets = await actions.borrow.getMarkets({ asset: USDC })

// Get all markets on a specific chain
const baseMarkets = await actions.borrow.getMarkets({ chainId: 84532 })

// Get all markets
const allMarkets = await actions.borrow.getMarkets()
```

**Parameters:**

```typescript
interface GetBorrowMarketsParams {
  /** Filter by chain ID */
  chainId?: number
  /** Filter by borrowable asset */
  asset?: Asset
  /** Filter by collateral asset */
  collateralAsset?: Asset
}
```

**Returns:** `BorrowMarket[]`

```typescript
interface BorrowMarket {
  /** Market identifier */
  marketId: BorrowMarketId
  /** Borrowable asset */
  asset: Asset
  /** Accepted collateral assets */
  collateralAssets: Asset[]
  /** Current variable borrow APR */
  variableRate: number
  /** Current stable borrow APR (if supported) */
  stableRate?: number
  /** Available liquidity to borrow (wei) */
  availableLiquidity: bigint
  /** Total borrowed (wei) */
  totalBorrowed: bigint
  /** Utilization rate (0.80 = 80%) */
  utilizationRate: number
  /** Maximum LTV for each collateral asset */
  maxLtv: Record<string, number>
  /** Liquidation threshold for each collateral asset */
  liquidationThreshold: Record<string, number>
  /** Provider name */
  provider: string
}

type BorrowMarketId = {
  /** Market identifier (protocol-specific) */
  marketId: string
  /** Chain ID */
  chainId: number
}
```

---

### `actions.borrow.getMarket(params)`

Get current info for a specific borrow market.

```typescript
const market = await actions.borrow.getMarket({
  marketId: '0x...',
  chainId: 84532,
})
```

**Parameters:**

```typescript
type GetBorrowMarketParams = BorrowMarketId
```

**Returns:** `BorrowMarket`

---

## SDK Configuration

### ActionsConfig

```typescript
const actions = createActions({
  wallet: { /* ... */ },
  chains: [ /* ... */ ],

  // Borrow configuration
  borrow: {
    aave: {
      maxLtv: 0.75,            // Cap LTV at 75% (optional safety)
      minHealthFactor: 1.2,    // Prevent borrows below 1.2 HF
    },
  },
})
```

### BorrowConfig Type

Multiple providers can be configured simultaneously. The SDK aggregates results across all providers for methods like `getMarkets()` and `rates()`.

```typescript
interface BorrowConfig {
  /** Aave borrow provider configuration */
  aave?: BorrowProviderConfig
  /** Compound borrow provider configuration */
  compound?: BorrowProviderConfig
  // Future providers added here
}

interface BorrowProviderConfig {
  /** Maximum allowed LTV ratio (e.g., 0.75 for 75%). Overrides protocol max. */
  maxLtv?: number
  /** Minimum health factor to allow borrows (e.g., 1.2). Prevents risky positions. */
  minHealthFactor?: number
  /** Collateral allowlist - restrict which assets can be used as collateral */
  collateralAllowlist?: CollateralConfig[]
  /** Collateral blocklist - exclude specific collateral assets */
  collateralBlocklist?: CollateralConfig[]
  /** Asset allowlist - restrict which assets can be borrowed */
  assetAllowlist?: AssetBorrowConfig[]
  /** Asset blocklist - exclude specific borrowable assets */
  assetBlocklist?: AssetBorrowConfig[]
}
```

### Collateral & Asset Configuration

```typescript
interface CollateralConfig {
  /** Collateral asset */
  asset: Asset
  /** Chain ID */
  chainId: number
}

interface AssetBorrowConfig {
  /** Borrowable asset */
  asset: Asset
  /** Chain ID */
  chainId: number
}
```

---

## Design Decisions

- **Multi-provider aggregation** - Configure multiple providers (Aave, Compound); SDK aggregates results for `getMarkets()` and `rates()`
- **Adapter pattern** - `BorrowProvider` base class with `AaveBorrowProvider` implementation (mirrors `LendProvider` and `SwapProvider` patterns)
- **Health factor safety** - Configurable minimum health factor prevents dangerously leveraged positions
- **LTV caps** - Optional max LTV override prevents borrowing up to protocol limits
- **Transparent approvals** - Token approvals for repayment handled internally; SDK batches approval + repay transactions
- **Collateral restrictions** - Optional allowlist/blocklist by collateral and borrowable assets
- **Variable rate default** - Defaults to variable interest rate mode unless explicitly set to stable
- **Complementary to Lend** - Works alongside LendProvider; collateral supplied via `wallet.lend.supply()` can be borrowed against via `wallet.borrow.execute()`

---

## Testnet Support

- **Target chain:** Base Sepolia (84532)
- **Contracts:** Aave V3 Pool, Oracle, and related contracts on Base Sepolia
- **Demo markets:** USDC borrowing with ETH collateral, ETH borrowing with USDC collateral

---

## Demo Application

The borrow feature will be integrated into the existing demo:

- **Frontend:** Borrow tab (currently "Coming Soon") with borrow and repay forms
- **Backend:** `/borrow/execute`, `/borrow/repay`, `/borrow/positions`, and `/borrow/rates` endpoints
- **Health factor display** with visual indicator (green/yellow/red)
- **Position management** showing current borrows, collateral, and rates

---

## Usage Example

```typescript
import { createActions, USDC, ETH } from '@eth-optimism/actions-sdk'

// Initialize SDK with borrow config
const actions = createActions({
  wallet: { /* ... */ },
  chains: [{ chainId: 84532, rpcUrl: '...' }],
  lend: {
    aave: {},  // Enable lending (for supplying collateral)
  },
  borrow: {
    aave: {
      minHealthFactor: 1.5,  // Conservative safety margin
    },
  },
})

// Get wallet instance
const wallet = await actions.wallet.getSmartWallet({ signer })

// Step 1: Supply collateral via lend
await wallet.lend.supply({
  asset: ETH,
  amount: 2.0,
  chainId: 84532,
})

// Step 2: Check borrow rates (no wallet needed)
const rates = await actions.borrow.rates({
  asset: USDC,
  chainId: 84532,
})

console.log(`Borrow rate: ${(rates[0].variableRate * 100).toFixed(2)}%`)
console.log(`Available: ${rates[0].availableLiquidityFormatted} USDC`)

// Step 3: Borrow against collateral
const receipt = await wallet.borrow.execute({
  asset: USDC,
  amount: 1000,
  collateralAsset: ETH,
  chainId: 84532,
})

console.log(`Borrowed ${receipt.amountFormatted} USDC`)
console.log(`Health factor: ${receipt.healthFactor}`)

// Step 4: Check positions
const positions = await wallet.borrow.positions({ chainId: 84532 })
console.log(`Current debt: ${positions[0].debtFormatted} USDC`)
console.log(`LTV: ${(positions[0].ltv * 100).toFixed(1)}%`)

// Step 5: Repay
const repayReceipt = await wallet.borrow.repay({
  asset: USDC,
  amount: 500,
  chainId: 84532,
})

console.log(`Repaid ${repayReceipt.amountFormatted} USDC`)
console.log(`Remaining: ${repayReceipt.remainingDebtFormatted} USDC`)
```
