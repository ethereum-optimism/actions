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
  originChainId: 84532,  // Base Sepolia
  destinationChainId: 11155420, // OP Sepolia
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
  originChainId?: number
  /** Destination chain ID. If provided with originChainId, triggers bridge. */
  destinationChainId?: number
  /** Chain ID for single-chain transfers (legacy, mutually exclusive with originChainId/destinationChainId) */
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
  originChainId: number
  destinationChainId: number
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
  originChainId: 84532,
  destinationChainId: 11155420,
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
  originChainId: number
  /** Destination chain */
  destinationChainId: number
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
  originChainId: 84532,
  destinationChainId: 11155420,
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
//   { asset: USDC, originChainId: 84532, destinationChainId: 11155420, provider: 'native' },
//   { asset: USDC, originChainId: 84532, destinationChainId: 8453, provider: 'native' },
//   ...
// ]
```

**Returns:** `BridgeRoute[]`

```typescript
interface BridgeRoute {
  /** Asset that can be bridged */
  asset: Asset
  /** Source chain */
  originChainId: number
  /** Destination chain */
  destinationChainId: number
  /** Provider supporting this route */
  provider: string
}
```

---

## SDK Configuration

### ActionsConfig

Bridge configuration defaults to the native Optimism bridge. Developers can optionally configure a custom third-party provider for L2 ↔ L2 transfers.

```typescript
const actions = createActions({
  wallet: { /* ... */ },
  chains: [
    { chainId: 1, rpcUrl: '...' },      // Ethereum L1
    { chainId: 10, rpcUrl: '...' },     // OP Mainnet
    { chainId: 8453, rpcUrl: '...' },   // Base
  ],

  // Bridge defaults to native (L1 ↔ L2 only) - config optional
  bridge: {
    type: 'native',  // Optional - this is the default
  },

  // Or configure a third-party provider for L2 ↔ L2
  // bridge: {
  //   type: 'custom',
  //   client: customBridgeClient,
  // },
})
```

### BridgeConfig Type

```typescript
interface BridgeConfig {
  /** Bridge provider type (defaults to 'native') */
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
  originChainId: number
  /** Destination chain */
  destinationChainId: number
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
- **Adapter pattern** - `BridgeProvider` base class with `NativeBridgeProvider` (default) and extensible custom implementations
- **Default to native** - Native bridge is the default for L1 ↔ L2 transfers, custom providers available for L2 ↔ L2
- **Transparent integration** - Bridge triggered automatically when `originChainId !== destinationChainId` in `send()`
- **Smart chain detection** - Auto-detect source chain from wallet balances when not specified
- **Superchain registry** - Built-in bridge addresses for all Superchain networks, extensible for custom chains
- **Fee protection** - Optional max fee percentage to prevent expensive bridges
- **Route restrictions** - Optional allowlist/blocklist by asset and chain pairs

---

## Bridge Providers

### Native Bridge (Optimism Standard Bridge)

The Actions SDK includes a built-in implementation of the Optimism Native Bridge for L1 ↔ L2 transfers.

**Important:** The native bridge only supports transfers between Ethereum L1 and individual L2 chains. It does NOT support direct L2 ↔ L2 transfers (e.g., Base → OP Mainnet). For L2 ↔ L2 bridging, use a custom bridge provider.

- **Routes:** Ethereum L1 ↔ Each L2 (OP Mainnet, Base, OP Sepolia, Base Sepolia, Mode, Fraxtal, etc.)
- **Fee:** 0% bridge fee (gas only)
- **Time:** ~10 minutes (L1 → L2), ~7 days (L2 → L1 with fault proofs)
- **Assets:** ETH, USDC, USDT, and all Superchain-native tokens
- **L2 Contract:** `0x4200000000000000000000000000000000000010` (standard predeploy across all OP Stack chains)
- **L1 Contracts:** Chain-specific StandardBridge addresses (sourced from [Superchain Registry](https://github.com/ethereum-optimism/superchain-registry))

#### Superchain Bridge Addresses

The SDK includes L1StandardBridge addresses for all Superchain networks:

| Network | Chain ID | L1StandardBridge |
|---------|----------|------------------|
| OP Mainnet | 10 | `0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1` |
| Base | 8453 | `0x3154Cf16ccdb4C6d922629664174b904d80F2C35` |
| OP Sepolia | 11155420 | `0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1` |
| Base Sepolia | 84532 | `0xfd0Bf71F60660E2f608ed56e1659C450eB113120` |
| Mode | 34443 | `0x735aDBbE72226BD52e818E7181953f42E3b0FF21` |
| Fraxtal | 252 | `0x34C0bD5877A5Ee7099D0f5688D65F4bB9158BDE2` |

For additional Superchain networks, the SDK will fetch addresses from the [Superchain Registry](https://github.com/ethereum-optimism/superchain-registry).

### Custom Bridge Providers

For L2 ↔ L2 transfers and advanced routing, developers can integrate third-party bridge aggregators by implementing the `BridgeClient` interface and passing the client instance to Actions configuration.

---

## Usage Example

### Using Native Bridge (L1 ↔ L2) - Default

```typescript
import { createActions, USDC } from '@eth-optimism/actions-sdk'

// Initialize SDK - native bridge is default
const actions = createActions({
  wallet: { /* ... */ },
  chains: [
    { chainId: 11155111, rpcUrl: '...' }, // Ethereum Sepolia (L1)
    { chainId: 11155420, rpcUrl: '...' }, // OP Sepolia (L2)
  ],
  // bridge config optional - defaults to native
})

// Get wallet instance
const wallet = await actions.wallet.getSmartWallet({ signer })

// Optional: Get bridge quote before execution
const quote = await actions.bridge.quote({
  asset: USDC,
  amount: 100,
  originChainId: 11155111,  // L1
  destinationChainId: 11155420,     // L2
})

console.log(`Bridge via ${quote.provider}`)
console.log(`Fee: ${quote.feePercent * 100}%`)
console.log(`Time: ~${quote.estimatedTime}s`)

// Execute cross-chain transfer (L1 → L2)
const receipt = await wallet.send({
  amount: 100,
  asset: USDC,
  to: '0x...',
  originChainId: 11155111,
  destinationChainId: 11155420,
})

console.log(`Bridged! Tx: ${receipt.receipt.transactionHash}`)
console.log(`Track: ${receipt.trackingUrl}`)
```

### Using Custom Bridge (L2 ↔ L2)

```typescript
import { createActions } from '@eth-optimism/actions-sdk'
import { BridgeClient } from 'third-party-bridge-sdk'

// Initialize custom bridge client
const bridgeClient = new BridgeClient({
  apiKey: process.env.BRIDGE_API_KEY!,
})

// Initialize SDK with custom bridge
const actions = createActions({
  wallet: { /* ... */ },
  chains: [
    { chainId: 84532, rpcUrl: '...' },   // Base Sepolia
    { chainId: 11155420, rpcUrl: '...' }, // OP Sepolia
  ],
  bridge: {
    type: 'custom',
    client: bridgeClient,  // Custom bridge for L2 ↔ L2
  },
})

// Now can bridge between L2s
const receipt = await wallet.send({
  amount: 100,
  asset: USDC,
  to: '0x...',
  originChainId: 84532,    // Base Sepolia
  destinationChainId: 11155420,   // OP Sepolia
})
```

---

## Demo Application

The bridge feature will be integrated into the existing demo:

- **Frontend:** Enhanced "Pay" tab with chain selector for source and destination
- **Backend:** `/send/execute` endpoint with bridge support, `/bridge/quote` endpoint
- **Price preview** before execution showing fees and estimated time
