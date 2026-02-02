# SwapProvider API Specification

## Overview

The Actions SDK enables embedded wallet integrations to connect with DeFi actions including Lend, Borrow, Swap, and Pay. This specification defines the **SwapProvider** feature for single-chain token swaps, with Uniswap as the initial implementation.

The SDK uses an **adapter pattern** that supports multiple swap providers. Developers configure which providers to enable, and the SDK handles routing, approvals, and transaction execution transparently.

---

## Wallet Namespace API

### `wallet.swap.execute(params)`

Execute a token swap.

```typescript
const receipt = await wallet.swap.execute({
  amountIn: 100,           // Human-readable amount (e.g., 100 USDC)
  assetIn: USDC,
  assetOut: ETH,
  chainId: 84532,
})
```

**Parameters:**

```typescript
interface SwapExecuteParams {
  /** Amount of input token (human-readable). Required if amountOut not provided. */
  amountIn?: number
  /** Amount of output token for exact output swaps. Required if amountIn not provided. */
  amountOut?: number
  /** Token to sell */
  assetIn: Asset
  /** Token to buy */
  assetOut: Asset
  /** Chain to execute swap on */
  chainId: number
  /** Slippage tolerance (e.g., 0.005 for 0.5%). Overrides config default. */
  slippage?: number
  /** Unix timestamp deadline. Defaults to now + 1 minute. */
  deadline?: number
  /** Recipient address. Defaults to wallet address. */
  recipient?: Address
}
```

**Returns:** `SwapReceipt`

```typescript
interface SwapReceipt {
  receipt: TransactionReceipt    // Blockchain transaction receipt
  amountIn: bigint               // Actual input amount (wei)
  amountOut: bigint              // Actual output amount (wei)
  assetIn: Asset
  assetOut: Asset
  price: string                  // Execution price (human-readable)
  priceImpact: number            // Price impact as decimal (0.01 = 1%)
}
```

---

### `wallet.swap.price(params)` / `actions.swap.price(params)`

Get a price quote before execution. Available on both `wallet.swap` and `actions.swap` (no wallet required for quotes).

```typescript
const quote = await wallet.swap.price({
  assetIn: USDC,
  assetOut: ETH,
  amountIn: 100,
  chainId: 84532,
})
```

**Parameters:**

```typescript
interface SwapPriceParams {
  /** Token to get price for */
  assetIn: Asset
  /** Token to price against. Defaults to USDC. */
  assetOut?: Asset
  /** Input amount. Defaults to 1 unit. */
  amountIn?: number
  /** Output amount for reverse quotes. */
  amountOut?: number
  /** Chain to get price on */
  chainId: number
}
```

**Returns:** `SwapPrice`

```typescript
interface SwapPrice {
  price: string                  // Exchange rate (e.g., "3245.50")
  priceInverse: string           // Inverse rate
  amountIn: bigint               // Input amount (wei)
  amountOut: bigint              // Expected output (wei)
  amountOutFormatted: string     // Human-readable output
  priceImpact: number            // Price impact as decimal
  route: SwapRoute               // Path taken for multi-hop swaps
  gasEstimate?: bigint           // Estimated gas (wei)
}

interface SwapRoute {
  path: Asset[]                  // Ordered list of assets in route
  pools: SwapMarketInfo[]          // Market info for each hop
}
```

---

### `actions.swap.prices(params)`

Get price quotes from ALL configured providers for comparison. Available on both `wallet.swap` and `actions.swap`.

```typescript
// Compare prices across all providers (Uniswap, 1inch, 0x, etc.)
const quotes = await actions.swap.prices({
  assetIn: USDC,
  assetOut: ETH,
  amountIn: 1000,
  chainId: 84532,
})

// Results sorted by best output amount
console.log(quotes[0].provider)    // "oneInch" (best rate)
console.log(quotes[0].amountOut)   // 0.42n ETH
console.log(quotes[1].provider)    // "uniswap"
console.log(quotes[1].amountOut)   // 0.41n ETH
```

**Returns:** `SwapPriceWithProvider[]` (sorted by best output)

```typescript
interface SwapPriceWithProvider extends SwapPrice {
  provider: string   // Provider name (e.g., 'uniswap', 'oneInch')
}
```

---

### `actions.swap.getMarkets(params)`

Get available swap markets across ALL configured providers. Available on `actions.swap` (no wallet required).

```typescript
// Get all USDC markets across ALL providers (Uniswap + 1inch + 0x + ...)
const markets = await actions.swap.getMarkets({ asset: USDC })

// Get all markets on a specific chain
const baseMarkets = await actions.swap.getMarkets({ chainId: 84532 })

// Get all markets (no filter)
const allMarkets = await actions.swap.getMarkets()
```

**Parameters:**

```typescript
interface GetSwapMarketsParams {
  /** Filter by chain ID */
  chainId?: number
  /** Filter by asset (returns markets containing this asset) */
  asset?: Asset
}
```

**Returns:** `SwapMarket[]`

---

### `actions.swap.getMarket(params)`

Get current info for a specific swap market.

```typescript
const market = await actions.swap.getMarket({
  poolId: '0x...',    // Pool ID hash
  chainId: 84532,
})
```

**Parameters:**

```typescript
// Unique identifier for a swap market (mirrors LendMarketId)
type SwapMarketId = {
  poolId: string                 // Pool ID hash (keccak256 of PoolKey)
  chainId: number
}

type GetSwapMarketParams = SwapMarketId
```

**Returns:** `SwapMarket`

```typescript
interface SwapMarket {
  /** Market identifier */
  marketId: SwapMarketId
  /** Token pair */
  assets: [Asset, Asset]
  /** Fee tier in pips (500 = 0.05%) */
  fee: number
  /** Total value locked */
  tvl?: bigint
  /** 24h volume */
  volume24h?: bigint
  /** Provider name */
  provider: 'uniswap'
}
```

**Data source:** Pools are fetched via [Uniswap V4 Subgraph](https://docs.uniswap.org/api/subgraph/overview) (The Graph).

---

## SDK Configuration

### ActionsConfig

```typescript
const actions = createActions({
  wallet: { /* ... */ },
  chains: [ /* ... */ ],

  // Swap configuration
  swap: {
    uniswap: {
      defaultSlippage: 0.005,    // 0.5% default
      pairAllowlist: [           // Optional: restrict pairs
        { assets: [USDC, ETH], chainId: 84532 },
      ],
    },
  },
})
```

### SwapConfig Type

Multiple providers can be configured simultaneously. The SDK aggregates results across all providers for methods like `getMarkets()` and `prices()`.

```typescript
interface SwapConfig {
  uniswap?: SwapProviderConfig
  oneInch?: SwapProviderConfig
  zeroX?: SwapProviderConfig
  // Future providers added here
}

interface SwapProviderConfig {
  /** Default slippage tolerance (e.g., 0.005 for 0.5%) */
  defaultSlippage?: number
  /** Allowlist of trading pairs (optional) */
  pairAllowlist?: SwapPairConfig[]
  /** Blocklist of trading pairs to exclude */
  pairBlocklist?: SwapPairConfig[]
}
```

### Pair Configuration

```typescript
interface SwapPairConfig {
  assets: [Asset, Asset]   // Token pair (order doesn't matter)
  chainId: number
}
```

---

## Design Decisions

- **Multi-provider aggregation** - Configure multiple providers (Uniswap, 1inch, 0x); SDK aggregates results for `getMarkets()` and `prices()`
- **Adapter pattern** - `SwapProvider` base class with `UniswapSwapProvider` implementation (mirrors `LendProvider` pattern)
- **Universal Router** - Routes across V2/V3/V4 automatically for best pricing; handles multi-hop and split routes
- **Transparent approvals** - Permit2 flow handled internally; SDK batches approval + swap transactions
- **Slippage cascade** - Provider default (0.5%) → Config override → Execute param override
- **Pair restrictions** - Optional allowlist/blocklist by asset pairs

---

## Testnet Support

- **Target chain:** Base Sepolia (84532)
- **Contracts:** PoolManager, Universal Router, Quoter, Permit2 (V4 deployed)
- **Demo pool:** DemoUSDC/DemoOP pair, 0.05% fee tier, 100k initial liquidity each

---

## Demo Application

The swap feature will be integrated into the existing demo:

- **Frontend:** Action tabs (Lend, Borrow, Swap, Pay) with swap form
- **Backend:** `/swap/execute` and `/swap/price` endpoints
- **Price preview** before execution (following Uniswap interface patterns)

---

## Usage Example

```typescript
import { createActions, USDC, ETH } from '@eth-optimism/actions-sdk'

// Initialize SDK with swap config
const actions = createActions({
  wallet: { /* ... */ },
  chains: [{ chainId: 84532, rpcUrl: '...' }],
  swap: {
    uniswap: { defaultSlippage: 0.005 },
  },
})

// Get wallet instance
const wallet = await actions.wallet.getSmartWallet({ signer })

// Get price quote (no wallet needed)
const quote = await actions.swap.price({
  assetIn: USDC,
  assetOut: ETH,
  amountIn: 100,
  chainId: 84532,
})

console.log(`Rate: 1 USDC = ${quote.price} ETH`)
console.log(`You'll receive: ${quote.amountOutFormatted} ETH`)

// Execute swap
const receipt = await wallet.swap.execute({
  amountIn: 100,
  assetIn: USDC,
  assetOut: ETH,
  chainId: 84532,
})

console.log(`Swapped! Tx: ${receipt.receipt.transactionHash}`)
```
