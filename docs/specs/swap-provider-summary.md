# SwapProvider API Specification

## Overview

The Actions SDK enables embedded wallet integrations to connect with DeFi actions including Lend, Borrow, Swap, and Pay. This specification defines the **SwapProvider** feature for single-chain token swaps, with Uniswap as the initial implementation.

The SDK uses an **adapter pattern** that supports multiple swap providers. Developers configure which providers to enable, and the SDK handles routing, approvals, and transaction execution transparently.

---

## Wallet Namespace API

### `wallet.swap.execute(params, chainId)`

Execute a token swap.

```typescript
const receipt = await wallet.swap.execute({
  amountIn: 100,           // Human-readable amount (e.g., 100 USDC)
  assetIn: USDC,
  assetOut: ETH,
}, chainId)
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
  /** Slippage tolerance (e.g., 0.005 for 0.5%). Overrides config default. */
  slippage?: number
  /** Unix timestamp deadline. Defaults to now + 20 minutes. */
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
  pools: SwapPoolInfo[]          // Pool info for each hop
}
```

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

```typescript
interface SwapConfig {
  uniswap?: SwapProviderConfig
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

Supports two formats for specifying trading pairs:

```typescript
// Simple format: asset pair
interface SwapPairSimple {
  assets: [Asset, Asset]
  chainId: number
}

// Explicit format: specific pool (V4 PoolKey)
interface SwapPairExplicit {
  poolKey: PoolKey
  chainId: number
}

interface PoolKey {
  currency0: Address
  currency1: Address
  fee: number              // Fee in pips (500 = 0.05%)
  tickSpacing: number
  hooks: Address           // Zero address for no hooks
}
```

---

## Design Decisions

### Adapter Pattern
- `SwapProvider` abstract base class defines the interface
- `UniswapSwapProvider` implements Uniswap-specific logic
- Future providers (1inch, 0x, etc.) implement the same interface
- Mirrors existing `LendProvider` pattern with Morpho/Aave adapters

### Universal Router
- Single Uniswap integration via Universal Router
- Automatically routes across V2, V3, and V4 pools for best pricing
- No need for separate version-specific providers
- Auto Router handles multi-hop and split routes

### Transparent Approvals
- Permit2 approval flow handled internally
- SDK checks existing allowances before each swap
- Batches approval + swap transactions when needed
- Developers only call `execute()` - no separate approval step

### Slippage Cascade
- Provider default (0.5%) → Config override → Execute param override
- Each level can override the previous

### Pair Restrictions
- Optional allowlist/blocklist for trading pairs
- Supports both simple asset pairs and explicit V4 PoolKeys
- If no allowlist configured, all supported assets allowed

---

## Testnet Support

### Base Sepolia (Chain ID: 84532)

Initial implementation targets Base Sepolia with Uniswap V4:

| Contract | Address |
|----------|---------|
| PoolManager | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| Universal Router | `0x492e6456d9528771018deb9e87ef7750ef184104` |
| Quoter | `0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

### Demo Pool Setup

A deployment script will create a V4 pool with:
- **Pair:** DemoUSDC / DemoOP (mintable test tokens)
- **Fee tier:** 500 (0.05% - lowest tier)
- **Initial liquidity:** 100k each token

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
}, 84532)

console.log(`Swapped! Tx: ${receipt.receipt.transactionHash}`)
```
