# BridgeProvider API Specification

## Overview

The Actions SDK enables embedded wallet integrations to connect with DeFi actions including Lend, Borrow, Swap, and Pay. This specification defines the **BridgeProvider** feature for cross-chain token transfers, integrating with the existing `send()` functionality.

The SDK uses an **adapter pattern** that supports multiple bridge providers. Developers configure which providers to enable, and the SDK handles routing, approvals, and transaction execution transparently.

---

## Wallet Namespace API

### `wallet.send(params)` - Enhanced with Bridge Support

Send tokens on a single chain or across chains.

```typescript
// Single-chain send (existing behavior)
const receipt = await wallet.send({
  amount: 100,
  asset: USDC,
  to: '0x...',
  chainId: 84532,
})

// Cross-chain send (new - with bridge)
const receipt = await wallet.send({
  amount: 100,
  asset: USDC,
  to: '0x...',
  fromChainId: 84532,  // Base Sepolia
  toChainId: 11155420, // OP Sepolia
})
```

**Parameters:**

```typescript
interface SendParams {
  /** Amount to send (human-readable) */
  amount: number
  /** Asset to transfer */
  asset: Asset
  /** Recipient address */
  to: Address
  /** Source chain ID. Required for cross-chain transfers. */
  fromChainId?: number
  /** Destination chain ID. If provided with fromChainId, triggers bridge. */
  toChainId?: number
  /** Chain ID for single-chain transfers (legacy, mutually exclusive with fromChainId/toChainId) */
  chainId?: number
}
```

**Returns:** `SendReceipt | BridgeReceipt`

```typescript
interface SendReceipt {
  receipt: TransactionReceipt    // Blockchain transaction receipt
  amount: bigint                 // Actual amount sent (wei)
  asset: Asset
  to: Address
}

interface BridgeReceipt extends SendReceipt {
  fromChainId: number
  toChainId: number
  bridgeProvider: string         // Provider used (e.g., 'native', 'thirdParty')
  estimatedArrival?: number      // Unix timestamp for estimated arrival
  trackingUrl?: string           // URL to track bridge transaction
}
```

---

## Actions Namespace API

### `actions.bridge.quote(params)`

Get a quote for a cross-chain transfer before execution.

```typescript
const quote = await actions.bridge.quote({
  asset: USDC,
  amount: 100,
  fromChainId: 84532,
  toChainId: 11155420,
})

console.log(`Fee: ${quote.fee}`)
console.log(`Time: ${quote.estimatedTime}s`)
```

**Parameters:**

```typescript
interface BridgeQuoteParams {
  /** Asset to bridge */
  asset: Asset
  /** Amount to bridge (human-readable) */
  amount: number
  /** Source chain */
  fromChainId: number
  /** Destination chain */
  toChainId: number
  /** Recipient address (optional, defaults to sender) */
  to?: Address
}
```

**Returns:** `BridgeQuote`

```typescript
interface BridgeQuote {
  /** Input amount (wei) */
  amountIn: bigint
  /** Expected output amount after fees (wei) */
  amountOut: bigint
  /** Bridge fee in source asset (wei) */
  fee: bigint
  /** Bridge fee as percentage (0.001 = 0.1%) */
  feePercent: number
  /** Estimated time in seconds */
  estimatedTime: number
  /** Gas estimate for source chain (wei) */
  gasEstimate?: bigint
  /** Provider that will be used */
  provider: string
}
```

---

### `actions.bridge.quotes(params)`

Get quotes from ALL configured providers for comparison.

```typescript
// Compare fees and times across all providers
const quotes = await actions.bridge.quotes({
  asset: USDC,
  amount: 1000,
  fromChainId: 84532,
  toChainId: 11155420,
})

// Results sorted by best output amount (lowest fees)
console.log(quotes[0].provider)    // "native" (best)
console.log(quotes[0].amountOut)   // 1000 USDC (0% fee)
console.log(quotes[1].provider)    // "thirdParty"
console.log(quotes[1].amountOut)   // 999.0 USDC
```

**Returns:** `BridgeQuote[]` (sorted by best output)

---

### `actions.bridge.supportedRoutes()`

Get all supported bridge routes across all providers.

```typescript
const routes = await actions.bridge.supportedRoutes()

// Find routes for USDC
const usdcRoutes = routes.filter(r => r.asset.metadata.symbol === 'USDC')
console.log(usdcRoutes)
// [
//   { asset: USDC, fromChainId: 84532, toChainId: 11155420, provider: 'native' },
//   { asset: USDC, fromChainId: 84532, toChainId: 8453, provider: 'native' },
//   ...
// ]
```

**Returns:** `BridgeRoute[]`

```typescript
interface BridgeRoute {
  /** Asset that can be bridged */
  asset: Asset
  /** Source chain */
  fromChainId: number
  /** Destination chain */
  toChainId: number
  /** Provider supporting this route */
  provider: string
}
```

---

## SDK Configuration

### ActionsConfig

```typescript
const actions = createActions({
  wallet: { /* ... */ },
  chains: [ /* ... */ ],

  // Bridge configuration
  bridge: {
    type: 'native',  // Default: Optimism Native Bridge
    // Or configure a third-party provider
    // type: 'custom',
    // client: customBridgeClient,
  },
})
```

### BridgeConfig Type

Developers can use the native bridge (default) or provide a custom bridge client following the provider pattern.

```typescript
interface BridgeConfig {
  /** Bridge provider type ('native' or 'custom') */
  type?: 'native' | 'custom'

  /** Custom bridge client instance (required if type === 'custom') */
  client?: BridgeClient

  /** Provider-specific configuration */
  config?: {
    /** Maximum acceptable fee as percentage (e.g., 0.01 for 1%) */
    maxFeePercent?: number
    /** Route allowlist (optional) */
    routeAllowlist?: BridgeRouteConfig[]
    /** Route blocklist (optional) */
    routeBlocklist?: BridgeRouteConfig[]
  }
}

interface BridgeRouteConfig {
  /** Asset to bridge */
  asset: Asset
  /** Source chain */
  fromChainId: number
  /** Destination chain */
  toChainId: number
}

/**
 * Interface that custom bridge clients must implement
 */
interface BridgeClient {
  getQuote(params: BridgeQuoteParams): Promise<BridgeQuote>
  buildTransaction(params: any): Promise<BridgeTransactionData>
  getSupportedRoutes?(): BridgeRoute[]
}
```

---

## Design Decisions

- **Provider pattern** - Developers instantiate bridge clients and pass to Actions SDK (Actions never handles API keys)
- **Adapter pattern** - `BridgeProvider` base class with `NativeBridgeProvider` default and extensible custom implementations
- **Transparent integration** - Bridge triggered automatically when `fromChainId !== toChainId` in `send()`
- **Smart chain detection** - Auto-detect source chain from wallet balances when not specified
- **Fee protection** - Optional max fee percentage to prevent expensive bridges
- **Route restrictions** - Optional allowlist/blocklist by asset and chain pairs

---

## Bridge Providers

### Native Bridge (Built-in Default)

The Actions SDK includes a built-in implementation of the Optimism Native Bridge:

- **Routes:** OP Mainnet ↔ Base, OP Sepolia ↔ Base Sepolia, Ethereum ↔ OP/Base
- **Fee:** 0% (gas only)
- **Time:** ~10 minutes (L1 → L2), ~7 days (L2 → L1 with fault proofs)
- **Assets:** ETH, USDC, USDT, and all Superchain-native tokens
- **Configuration:** Zero config required - works out of the box

### Custom Bridge Providers

Third-party bridge providers can be integrated by implementing the `BridgeClient` interface and passing the client instance to Actions configuration. See the provider pattern documentation for implementation details.

---

## Usage Example

```typescript
import { createActions, USDC } from '@eth-optimism/actions-sdk'

// Initialize SDK (bridge defaults to native)
const actions = createActions({
  wallet: { /* ... */ },
  chains: [
    { chainId: 84532, rpcUrl: '...' }, // Base Sepolia
    { chainId: 11155420, rpcUrl: '...' }, // OP Sepolia
  ],
  // bridge config optional - defaults to native bridge
})

// Get wallet instance
const wallet = await actions.wallet.getSmartWallet({ signer })

// Optional: Get bridge quote before execution
const quote = await actions.bridge.quote({
  asset: USDC,
  amount: 100,
  fromChainId: 84532,
  toChainId: 11155420,
})

console.log(`Bridge via ${quote.provider}`)
console.log(`Fee: ${quote.feePercent * 100}%`)
console.log(`Time: ~${quote.estimatedTime}s`)

// Execute cross-chain transfer
const receipt = await wallet.send({
  amount: 100,
  asset: USDC,
  to: '0x...',
  fromChainId: 84532,
  toChainId: 11155420,
})

console.log(`Bridged! Tx: ${receipt.receipt.transactionHash}`)
console.log(`Track: ${receipt.trackingUrl}`)
```

---

## Demo Application

The bridge feature will be integrated into the existing demo:

- **Frontend:** Enhanced "Pay" tab with chain selector for source and destination
- **Backend:** `/send/execute` endpoint with bridge support, `/bridge/quote` endpoint
- **Price preview** before execution showing fees and estimated time
