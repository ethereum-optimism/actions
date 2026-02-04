# Bridge Provider Design Review

## Overview

This document outlines the refined bridge provider architecture for the Actions SDK, following the established provider patterns (LendProvider, SwapProvider) while maintaining a minimal developer-facing API.

---

## Core Design Principles

### 1. Provider Abstraction Pattern

```
BridgeProvider (abstract base class)
├── NativeBridgeProvider (default: OP/Base native bridges)
└── SocketBridgeProvider (optional: Socket aggregator)
```

**Key Points:**
- Base `BridgeProvider` defines interface (similar to `LendProvider`, `SwapProvider`)
- Multiple implementations can coexist
- Configurable in `ActionsConfig.bridge`

### 2. Minimal Developer API

**No explicit bridge namespace.** Everything through `wallet.send()`:

```typescript
// Same-chain transfer (existing behavior)
wallet.send({
  amount: 100,
  asset: USDC,
  to: '0x...'
})

// Cross-chain transfer (implicit bridging)
wallet.send({
  amount: 100,
  asset: USDC,
  to: '0x...',
  fromChainId: 10,    // OP Mainnet
  toChainId: 8453     // Base - triggers bridge
})
```

### 3. Smart Chain Detection Logic

#### Case 1: No Chain ID Provided
```typescript
wallet.send({ amount: 100, asset: USDC, to: '0x...' })
```

**SDK Behavior:**
1. Check wallet balances across all chains for USDC
2. **If asset on single chain:** Auto-use that chain (same-chain transfer)
3. **If asset on multiple chains:** Error - require `fromChainId`
4. **If asset on no chains:** Error - insufficient balance

#### Case 2: Only `fromChainId` Provided
```typescript
wallet.send({
  amount: 100,
  asset: USDC,
  to: '0x...',
  fromChainId: 10
})
```

**SDK Behavior:**
- Same-chain transfer on specified chain
- No bridging

#### Case 3: Both `fromChainId` and `toChainId` Provided
```typescript
wallet.send({
  amount: 100,
  asset: USDC,
  to: '0x...',
  fromChainId: 10,
  toChainId: 8453
})
```

**SDK Behavior:**
1. Check configured bridge provider
2. Get bridge quote
3. Execute bridge transaction
4. Use configured provider (Native or Socket)

---

## Architecture Details

### Base BridgeProvider

```typescript
// packages/sdk/src/bridge/core/BridgeProvider.ts

export abstract class BridgeProvider<
  TConfig extends BridgeProviderConfig = BridgeProviderConfig
> {
  protected readonly _config: TConfig
  protected readonly chainManager: ChainManager

  /** Provider name (e.g., 'native', 'socket') */
  abstract readonly name: string

  /** Get quote for a bridge transfer */
  async quote(params: BridgeQuoteParams): Promise<BridgeQuote>

  /** Execute a bridge transfer */
  async execute(params: BridgeExecuteParams): Promise<BridgeTransaction>

  /** Get all supported routes */
  abstract supportedRoutes(): BridgeRoute[]

  /** Check if a specific route is supported */
  isRouteSupported(
    asset: Asset,
    fromChainId: number,
    toChainId: number
  ): boolean

  // Protected abstract methods for implementations
  protected abstract _getQuote(params: BridgeQuoteInternalParams): Promise<BridgeQuote>
  protected abstract _execute(params: BridgeExecuteInternalParams): Promise<BridgeTransaction>
}
```

### NativeBridgeProvider (Default)

```typescript
// packages/sdk/src/bridge/providers/native/NativeBridgeProvider.ts

export class NativeBridgeProvider extends BridgeProvider {
  readonly name = 'native'

  protected async _getQuote(params: BridgeQuoteInternalParams): Promise<BridgeQuote> {
    // Use Optimism SDK for native bridge quotes
    // - 0% fees (only gas)
    // - ~10 min L1→L2, ~7 days L2→L1
    const addresses = getNativeBridgeAddresses(params.fromChainId)

    return {
      amountIn: params.amountWei,
      amountOut: params.amountWei, // No fees
      fee: 0n,
      feePercent: 0,
      estimatedTime: estimateBridgeTime(params.fromChainId, params.toChainId),
      gasEstimate: await estimateGas(...),
      provider: 'native',
    }
  }

  protected async _execute(params: BridgeExecuteInternalParams): Promise<BridgeTransaction> {
    // Build transaction using L2StandardBridge or L1StandardBridge
    // Handle ETH vs ERC20
    // Include approval if needed
  }

  supportedRoutes(): BridgeRoute[] {
    // OP Mainnet ↔ Base
    // OP Sepolia ↔ Base Sepolia
    // L1 ↔ OP Mainnet
    // L1 ↔ Base
  }
}
```

### SocketBridgeProvider (Optional)

```typescript
// packages/sdk/src/bridge/providers/socket/SocketBridgeProvider.ts

export class SocketBridgeProvider extends BridgeProvider {
  readonly name = 'socket'
  private readonly apiClient: SocketAPIClient

  protected async _getQuote(params: BridgeQuoteInternalParams): Promise<BridgeQuote> {
    // Call Socket API: GET /v2/quote
    const response = await this.apiClient.getQuote({
      fromChainId: params.fromChainId,
      toChainId: params.toChainId,
      fromTokenAddress: getAssetAddress(params.asset, params.fromChainId),
      toTokenAddress: getAssetAddress(params.asset, params.toChainId),
      fromAmount: params.amountWei.toString(),
      userAddress: params.walletAddress,
      sort: 'output', // Best output amount
      singleTxOnly: true,
    })

    // Socket returns best route across all bridges
    return {
      amountIn: BigInt(response.fromAmount),
      amountOut: BigInt(response.toAmount),
      fee: BigInt(response.fromAmount) - BigInt(response.toAmount),
      feePercent: calculateFeePercent(response),
      estimatedTime: response.serviceTime || 300, // seconds
      gasEstimate: BigInt(response.gasFees?.gasAmount || 0),
      provider: 'socket',
      meta: {
        bridgeUsed: response.usedBridges[0], // e.g., 'across', 'hop'
        routeId: response.routeId,
      }
    }
  }

  protected async _execute(params: BridgeExecuteInternalParams): Promise<BridgeTransaction> {
    // First get quote to get routeId
    const quote = await this._getQuote(params)

    // Call Socket API: POST /v2/build-tx
    const txData = await this.apiClient.buildTransaction({
      route: quote.meta.routeId,
    })

    // Parse Socket response into our transaction format
    return {
      amountIn: params.amountWei,
      amountOut: quote.amountOut,
      asset: params.asset,
      to: params.to,
      fromChainId: params.fromChainId,
      toChainId: params.toChainId,
      fee: quote.fee,
      estimatedArrival: Math.floor(Date.now() / 1000) + quote.estimatedTime,
      transactionData: {
        approval: txData.approvalData ? {
          to: txData.approvalData.approvalTokenAddress,
          data: txData.approvalData.approvalData,
          value: 0n,
        } : undefined,
        bridge: {
          to: txData.txTarget,
          data: txData.txData,
          value: BigInt(txData.value || 0),
        }
      },
      provider: 'socket',
    }
  }

  supportedRoutes(): BridgeRoute[] {
    // Socket supports 15+ chains and 100+ tokens
    // Option 1: Return cached list
    // Option 2: Call Socket API /v2/supported/routes (on-demand or cached)
    return this.cachedRoutes || []
  }
}

// Socket API Client
class SocketAPIClient {
  constructor(
    private apiKey: string,
    private baseUrl: string = 'https://api.socket.tech'
  ) {}

  async getQuote(params: SocketQuoteRequest): Promise<SocketQuoteResponse> {
    const response = await fetch(`${this.baseUrl}/v2/quote?${buildQueryString(params)}`, {
      headers: {
        'API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
    })
    return response.json()
  }

  async buildTransaction(params: SocketBuildTxRequest): Promise<SocketBuildTxResponse> {
    const response = await fetch(`${this.baseUrl}/v2/build-tx`, {
      method: 'POST',
      headers: {
        'API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })
    return response.json()
  }

  async getStatus(params: {
    transactionHash: string
    fromChainId: number
    toChainId: number
  }): Promise<SocketStatusResponse> {
    const response = await fetch(
      `${this.baseUrl}/v2/bridge-status?${buildQueryString(params)}`,
      {
        headers: { 'API-KEY': this.apiKey },
      }
    )
    return response.json()
  }
}
```

---

## Enhanced wallet.send() Implementation

```typescript
// packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts

export abstract class Wallet {
  private bridgeProvider?: BridgeProvider

  /**
   * Send tokens (same-chain or cross-chain)
   */
  async send(params: SendParams): Promise<SendReceipt | BridgeReceipt> {
    // Step 1: Resolve chain IDs
    const { fromChainId, toChainId } = await this.resolveChainIds(params)

    // Step 2: Determine if this is a bridge transaction
    const isBridge = fromChainId !== toChainId

    if (!isBridge) {
      // Same-chain transfer
      return this.executeSameChainTransfer(params, fromChainId)
    }

    // Step 3: Cross-chain transfer (bridge)
    if (!this.bridgeProvider) {
      throw new Error('Bridge not configured. Add bridge config to ActionsConfig.')
    }

    return this.executeBridgeTransfer(params, fromChainId, toChainId)
  }

  /**
   * Resolve fromChainId and toChainId from params and wallet state
   */
  private async resolveChainIds(params: SendParams): Promise<{
    fromChainId: number
    toChainId: number
  }> {
    // Case 1: Both chain IDs provided
    if (params.fromChainId && params.toChainId) {
      return {
        fromChainId: params.fromChainId,
        toChainId: params.toChainId,
      }
    }

    // Case 2: Only fromChainId provided
    if (params.fromChainId) {
      return {
        fromChainId: params.fromChainId,
        toChainId: params.toChainId || params.fromChainId, // Default to same chain
      }
    }

    // Case 3: Legacy chainId parameter
    if (params.chainId) {
      return {
        fromChainId: params.chainId,
        toChainId: params.toChainId || params.chainId,
      }
    }

    // Case 4: No chain ID provided - auto-detect from balances
    const balances = await this.getBalance()
    const assetBalances = balances.find(
      (b) => b.asset.metadata.symbol === params.asset.metadata.symbol
    )

    if (!assetBalances) {
      throw new Error(`No balance found for ${params.asset.metadata.symbol}`)
    }

    // Filter chains with non-zero balance
    const chainsWithBalance = assetBalances.byChain.filter(
      (chain) => chain.balance > 0n
    )

    if (chainsWithBalance.length === 0) {
      throw new Error(
        `Insufficient balance for ${params.asset.metadata.symbol} on all chains`
      )
    }

    if (chainsWithBalance.length === 1) {
      // Single chain with balance - use it
      const chainId = chainsWithBalance[0].chainId
      return {
        fromChainId: chainId,
        toChainId: params.toChainId || chainId,
      }
    }

    // Multiple chains with balance - require explicit fromChainId
    throw new Error(
      `Asset ${params.asset.metadata.symbol} found on multiple chains ` +
      `(${chainsWithBalance.map(c => c.chainId).join(', ')}). ` +
      `Please specify 'fromChainId' parameter.`
    )
  }

  /**
   * Execute same-chain transfer
   */
  private async executeSameChainTransfer(
    params: SendParams,
    chainId: number
  ): Promise<SendReceipt> {
    const amountWei = parseUnits(
      params.amount.toString(),
      params.asset.metadata.decimals
    )

    const assetAddress = getAssetAddress(params.asset, chainId)

    // Build ERC20 transfer transaction
    const txData: TransactionData = {
      to: assetAddress,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [params.to, amountWei],
      }),
      value: 0n,
    }

    const receipt = await this.send(txData, chainId)

    return {
      receipt,
      amount: amountWei,
      asset: params.asset,
      to: params.to,
      chainId,
    }
  }

  /**
   * Execute cross-chain bridge transfer
   */
  private async executeBridgeTransfer(
    params: SendParams,
    fromChainId: number,
    toChainId: number
  ): Promise<BridgeReceipt> {
    // Get bridge transaction from provider
    const amountWei = parseUnits(
      params.amount.toString(),
      params.asset.metadata.decimals
    )

    const bridgeTx = await this.bridgeProvider!.execute({
      amountWei,
      asset: params.asset,
      to: params.to,
      fromChainId,
      toChainId,
      walletAddress: this.address,
    })

    // Execute transaction(s)
    const txs = []
    if (bridgeTx.transactionData.approval) {
      txs.push(bridgeTx.transactionData.approval)
    }
    txs.push(bridgeTx.transactionData.bridge)

    const receipt = txs.length > 1
      ? await this.sendBatch(txs, fromChainId)
      : await this.send(txs[0], fromChainId)

    return {
      receipt,
      amountIn: bridgeTx.amountIn,
      amountOut: bridgeTx.amountOut,
      asset: bridgeTx.asset,
      to: bridgeTx.to,
      fromChainId: bridgeTx.fromChainId,
      toChainId: bridgeTx.toChainId,
      fee: bridgeTx.fee,
      provider: bridgeTx.provider,
      estimatedArrival: bridgeTx.estimatedArrival,
      trackingUrl: this.getTrackingUrl(bridgeTx),
    }
  }

  private getTrackingUrl(bridgeTx: BridgeTransaction): string | undefined {
    if (bridgeTx.provider === 'native') {
      return `https://superscan.network/tx/${bridgeTx.fromChainId}/pending`
    }
    if (bridgeTx.provider === 'socket') {
      return `https://socketscan.io/tx/${bridgeTx.transactionHash}`
    }
    return undefined
  }
}
```

---

## Configuration

### ActionsConfig

```typescript
const actions = createActions({
  wallet: { /* ... */ },
  chains: [
    { chainId: 10, rpcUrl: '...' },      // OP Mainnet
    { chainId: 8453, rpcUrl: '...' },    // Base
  ],

  // Bridge configuration (optional)
  bridge: {
    // Option 1: Use native bridge (default if omitted)
    provider: 'native',

    // Option 2: Use Socket aggregator
    provider: 'socket',
    socket: {
      apiKey: process.env.SOCKET_API_KEY,
      apiBaseUrl: 'https://api.socket.tech', // optional
      maxFeePercent: 0.01, // 1% max fee
    },
  },
})
```

### BridgeConfig Type

```typescript
export interface BridgeConfig {
  /** Bridge provider to use ('native' or 'socket') */
  provider?: 'native' | 'socket'

  /** Socket-specific configuration (required if provider === 'socket') */
  socket?: {
    /** Socket API key */
    apiKey: string
    /** API base URL (optional, defaults to https://api.socket.tech) */
    apiBaseUrl?: string
    /** Maximum acceptable fee percentage (e.g., 0.01 = 1%) */
    maxFeePercent?: number
    /** Preferred bridges to use (optional filter) */
    preferredBridges?: string[] // e.g., ['across', 'hop', 'stargate']
  }

  /** Native bridge configuration (optional) */
  native?: {
    /** Maximum acceptable wait time for L2→L1 (seconds) */
    maxWaitTime?: number
  }
}
```

---

## Usage Examples

### Example 1: Auto-Detect Chain (Single Chain)

```typescript
const wallet = await actions.wallet.getSmartWallet({ signer })

// Wallet has 100 USDC only on OP Mainnet
// SDK auto-detects and uses OP Mainnet
const receipt = await wallet.send({
  amount: 50,
  asset: USDC,
  to: '0xRecipient...',
})

// Result: Same-chain transfer on OP Mainnet
```

### Example 2: Multi-Chain Balance (Error)

```typescript
const wallet = await actions.wallet.getSmartWallet({ signer })

// Wallet has USDC on both OP Mainnet and Base
const receipt = await wallet.send({
  amount: 50,
  asset: USDC,
  to: '0xRecipient...',
})

// Error: "Asset USDC found on multiple chains (10, 8453).
//         Please specify 'fromChainId' parameter."
```

### Example 3: Same-Chain Transfer (Explicit)

```typescript
const receipt = await wallet.send({
  amount: 50,
  asset: USDC,
  to: '0xRecipient...',
  fromChainId: 10, // OP Mainnet
})

// Result: Same-chain transfer on OP Mainnet
```

### Example 4: Cross-Chain Transfer (Bridge)

```typescript
const receipt = await wallet.send({
  amount: 50,
  asset: USDC,
  to: '0xRecipient...',
  fromChainId: 10,    // OP Mainnet
  toChainId: 8453,    // Base
})

// Result: Bridge from OP Mainnet to Base using configured provider
// If native: Uses OP native bridge (~10 min, 0% fee)
// If socket: Uses Socket's best route (varies by liquidity)

console.log(receipt.provider) // 'native' or 'socket'
console.log(receipt.fee) // Bridge fee in wei
console.log(receipt.trackingUrl) // URL to track bridge status
```

---

## Advanced: Read-Only Bridge Info (Optional)

For developers who want to preview bridge costs before execution:

```typescript
// Add optional methods on actions namespace
const quote = await actions.bridge.quote({
  asset: USDC,
  amount: 100,
  fromChainId: 10,
  toChainId: 8453,
})

console.log(`Fee: ${quote.feePercent * 100}%`)
console.log(`Time: ~${quote.estimatedTime}s`)
console.log(`Provider: ${quote.provider}`)

// Then execute with known costs
const receipt = await wallet.send({
  amount: 100,
  asset: USDC,
  to: '0x...',
  fromChainId: 10,
  toChainId: 8453,
})
```

**Implementation:**
```typescript
export class Actions {
  private _bridge?: BridgeProvider

  get bridge() {
    return this._bridge ? {
      quote: (params) => this._bridge!.quote(params),
      supportedRoutes: () => this._bridge!.supportedRoutes(),
    } : undefined
  }
}
```

---

## Key Decisions Summary

### ✅ Confirmed Decisions

1. **Base BridgeProvider abstraction** following LendProvider/SwapProvider patterns
2. **NativeBridgeProvider as default** - zero config required
3. **SocketBridgeProvider as optional** - requires API key
4. **No explicit wallet.bridge namespace** - everything through `wallet.send()`
5. **Smart chain detection** from wallet balances when chain IDs not provided
6. **Single provider at a time** - either native OR socket, not both simultaneously

### 🤔 Open Questions

1. **Socket API Key:**
   - Should it be required in config?
   - Or allow fallback to public endpoint with rate limits?

2. **Quote Preview:**
   - Should `actions.bridge.quote()` be exposed?
   - Or keep completely implicit?

3. **Error Handling:**
   - When Socket API is down, should we auto-fallback to native?
   - Or fail explicitly?

4. **Status Tracking:**
   - Should we add `wallet.getBridgeStatus(txHash)` method?
   - Or leave that to external tools?

5. **Backend Integration:**
   - Should Socket API calls go through demo backend?
   - Or directly from SDK with API key in browser?

---

## Next Steps

1. ✅ Review and approve high-level design
2. 📝 Update detailed spec with this design
3. 🔧 Implement base BridgeProvider
4. 🔧 Implement NativeBridgeProvider
5. 🔧 Implement SocketBridgeProvider
6. 🔧 Update wallet.send() with chain detection logic
7. 🧪 Add tests
8. 📚 Update demo app

---

## Sources

- [Optimism Bridging Basics](https://docs.optimism.io/app-developers/bridging/basics)
- [OP Stack Bridges Specification](https://specs.optimism.io/protocol/bridges.html)
- [Optimism Interoperability](https://specs.optimism.io/interop/overview.html)
- [Socket Optimism Governance Proposal](https://gov.optimism.io/t/ready-gf-phase-1-proposal-socket/3368)
- Socket Documentation (referenced: https://docs.socket.tech/introduction/)
