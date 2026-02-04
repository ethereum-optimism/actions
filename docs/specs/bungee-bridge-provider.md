# Bungee Bridge Provider Integration

> **Prerequisites:** This document assumes you've read [bridge-provider-summary.md](./bridge-provider-summary.md) and are familiar with the Actions SDK BridgeProvider pattern.

## Overview

Bungee will serve as the recommended custom bridge provider for Actions SDK, enabling L2 ↔ L2 transfers that the native Optimism bridge doesn't support.

**Integration Approach:** Actions SDK provides a `BungeeAPIAdapter` that wraps Bungee's REST API and implements the `BridgeClient` interface.

---

## BridgeClient Interface

The Actions SDK defines this interface for all bridge providers:

```typescript
interface BridgeClient {
  getQuote(params: BridgeQuoteParams): Promise<BridgeQuote>
  buildTransaction(params: any): Promise<BridgeTransactionData>
  getSupportedRoutes?(): BridgeRoute[]
}
```

### Actions SDK Types

```typescript
interface BridgeQuoteParams {
  asset: Asset
  amount: number           // Human-readable
  originChainId: number
  destinationChainId: number
  to?: Address            // Recipient (optional, defaults to sender)
}

interface BridgeQuote {
  amountIn: bigint        // Wei
  amountOut: bigint       // Wei (minAmountOut)
  fee: bigint             // Wei
  feePercent: number      // 0.001 = 0.1%
  estimatedTime: number   // Seconds
  gasEstimate?: bigint    // Wei
  provider: string        // "bungee"
  meta?: any             // Provider-specific data (e.g., quoteId)
}

interface BridgeTransactionData {
  txTarget: Address       // Contract to call
  txData: string          // Calldata
  value?: string          // ETH value
  approvalData?: {
    approvalTokenAddress: Address
    allowanceTarget: Address
    approvalAmount: string
  }
}
```

---

## API Mapping

### 1. `getQuote()` → `/api/v1/bungee/quote`

**Parameter Mapping:**

| Actions SDK | Bungee API | Transform |
|-------------|------------|-----------|
| `originChainId` | `originChainId` | `number` → `string` |
| `destinationChainId` | `destinationChainId` | `number` → `string` |
| `asset` | `inputToken` + `outputToken` | Get token address per chain |
| `amount` | `inputAmount` | Human → wei → `string` |
| `to` | `receiverAddress` | Pass through |
| N/A | `userAddress` | From wallet context |

**Response Mapping:**

```typescript
{
  amountIn: BigInt(result.input.amount),
  amountOut: BigInt(result.autoRoute.output.minAmountOut),
  fee: BigInt(result.input.amount) - BigInt(result.autoRoute.output.amount),
  feePercent: (fee / amountIn) * 100,
  estimatedTime: result.autoRoute.estimatedTime,
  gasEstimate: BigInt(result.autoRoute.gasFee.estimatedFee),
  provider: 'bungee',
  meta: {
    quoteId: result.autoRoute.quoteId,
    routeDetails: result.autoRoute.routeDetails
  }
}
```

### 2. `buildTransaction()` → `/api/v1/bungee/build-tx`

**Input:** Takes `quoteId` from `meta` in quote response

**Response Mapping:**

```typescript
{
  txTarget: result.txData.to,
  txData: result.txData.data,
  value: result.txData.value,
  approvalData: result.approvalData ? {
    approvalTokenAddress: result.approvalData.tokenAddress,
    allowanceTarget: result.approvalData.spenderAddress,
    approvalAmount: result.approvalData.amount
  } : undefined
}
```

### 3. `getSupportedRoutes()` → `/api/v1/supported-chains`

Derive `BridgeRoute[]` by combining chains that support sending and receiving:

```typescript
interface BridgeRoute {
  asset: Asset
  originChainId: number
  destinationChainId: number
  provider: string  // "bungee"
}
```

---

## Implementation Example

```typescript
// packages/sdk/src/bridge/adapters/BungeeAPIAdapter.ts

export class BungeeAPIAdapter implements BridgeClient {
  constructor(
    private config: {
      apiKey?: string
      baseURL?: string
      affiliateAddress?: string
    }
  ) {
    this.baseURL = config.baseURL || 'https://dedicated-backend.bungee.exchange'
  }

  async getQuote(params: BridgeQuoteParams): Promise<BridgeQuote> {
    const { asset, amount, originChainId, destinationChainId, to } = params

    // Convert to Bungee format
    const queryParams = {
      userAddress: this.walletAddress,
      originChainId: originChainId.toString(),
      destinationChainId: destinationChainId.toString(),
      inputToken: getAssetAddress(asset, originChainId),
      outputToken: getAssetAddress(asset, destinationChainId),
      inputAmount: parseUnits(amount, asset.decimals).toString(),
      receiverAddress: to || this.walletAddress,
    }

    const response = await fetch(
      `${this.baseURL}/api/v1/bungee/quote?${new URLSearchParams(queryParams)}`,
      {
        headers: {
          'x-api-key': this.config.apiKey || '',
          'affiliate': this.config.affiliateAddress || '',
        },
      }
    )

    const data = await response.json()
    if (!data.success) {
      throw new BridgeQuoteError(data.message)
    }

    return transformQuoteResponse(data.result)
  }

  async buildTransaction(params: { quoteId: string }): Promise<BridgeTransactionData> {
    const response = await fetch(
      `${this.baseURL}/api/v1/bungee/build-tx?quoteId=${params.quoteId}`,
      {
        headers: { 'x-api-key': this.config.apiKey || '' },
      }
    )

    const data = await response.json()
    if (!data.success) {
      throw new BridgeBuildError(data.message)
    }

    return transformBuildTxResponse(data.result)
  }
}
```

---

## Developer Setup

Developers configure Bungee as a custom bridge provider:

```typescript
import { createActions } from '@eth-optimism/actions-sdk'
import { BungeeAPIAdapter } from '@eth-optimism/actions-sdk/bridge/adapters'

const bungeeClient = new BungeeAPIAdapter({
  apiKey: process.env.BUNGEE_API_KEY!,
  baseURL: 'https://dedicated-backend.bungee.exchange',
})

const actions = createActions({
  wallet: { /* ... */ },
  chains: [
    { chainId: 10, rpcUrl: '...' },
    { chainId: 8453, rpcUrl: '...' },
  ],
  bridge: {
    type: 'custom',
    client: bungeeClient,
  },
})

// L2 ↔ L2 bridging now works
await wallet.send({
  amount: 100,
  asset: USDC,
  to: '0x...',
  originChainId: 8453,  // Base
  destinationChainId: 10,      // OP Mainnet
})
```

---

## Integration Requirements

### 1. API Authentication
- Production: Dedicated backend with API key via `x-api-key` header
- Testing: Public sandbox (no auth)

### 2. Native Token Handling
- Use `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` for native ETH

### 3. Error Handling
- Check `data.success` in responses
- Handle `statusCode` and `message` fields
- Quote expiry validation via `quoteExpiry` timestamp

### 4. Transaction Execution
- Actions SDK handles approval + bridge tx automatically
- Supports batched transactions (approval + bridge in one user signature)

### 5. Optional Features
The adapter can support additional Bungee features:
- `refuel`: Enable gas refuel on destination
- `feeBps`: Collect affiliate fees
- `enableManual`: Use manual routing

---

## Comparison: Native vs Bungee

| Feature | Native Bridge | Bungee |
|---------|---------------|--------|
| **Routes** | L1 ↔ L2 only | L1 ↔ L2 + L2 ↔ L2 |
| **L2→L2 Support** | ❌ | ✅ |
| **Bridge Fees** | 0% | ~0.05-0.5% |
| **Speed (L2→L1)** | ~7 days | ~1-15 min |
| **Setup** | Default | API key required |

**Strategy:**
- Native bridge (default) for L1 ↔ L2 (lowest cost)
- Bungee for L2 ↔ L2 and fast L2 → L1

---

## Resources

- **Bungee API Docs:** https://docs.bungee.exchange
- **Actions SDK Repo:** https://github.com/ethereum-optimism/actions
- **Bridge Provider Spec:** [bridge-provider-summary.md](./bridge-provider-summary.md)
