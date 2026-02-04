# BridgeProvider Feature Specification

## Overview

This specification defines the BridgeProvider abstraction for cross-chain token transfers in the Actions SDK. The implementation integrates with the existing `send()` functionality, automatically detecting and routing cross-chain transfers through appropriate bridge providers.

### Goals

- Enable cross-chain token transfers through a minimal API enhancement
- Follow established patterns from LendProvider and SwapProvider for consistency
- Support multiple bridge providers through extensible architecture
- Provide quotes before execution to show fees and timing
- Handle token approvals transparently
- Integrate seamlessly with existing `wallet.send()` API
- **Never expose API keys to Actions SDK** - developers instantiate clients

---

## Architecture

### Directory Structure

```
packages/sdk/src/
├── bridge/
│   ├── core/
│   │   ├── BridgeProvider.ts           # Abstract base class
│   │   └── __tests__/
│   │       └── BridgeProvider.test.ts
│   ├── providers/
│   │   └── native/
│   │       ├── NativeBridgeProvider.ts    # Optimism/Base native bridge
│   │       ├── sdk.ts                     # Bridge SDK wrapper
│   │       ├── addresses.ts               # Contract addresses per chain
│   │       └── __tests__/
│   │           └── NativeBridgeProvider.test.ts
│   ├── types/
│   │   ├── client.ts                      # BridgeClient interface
│   │   ├── config.ts                      # Configuration types
│   │   └── index.ts                       # Re-exports
│   └── __mocks__/
│       └── MockBridgeProvider.ts
├── types/
│   └── bridge/
│       ├── base.ts                       # Core bridge types
│       └── index.ts                      # Re-exports
```

### Pattern Reference

This implementation mirrors the established provider pattern:

| LendProvider | SwapProvider | BridgeProvider |
|--------------|--------------|----------------|
| `LendProvider` abstract class | `SwapProvider` abstract class | `BridgeProvider` abstract class |
| `MorphoLendProvider` | `UniswapSwapProvider` | `NativeBridgeProvider` |
| `AaveLendProvider` | - | `CustomBridgeProvider` |

---

## Provider Pattern: Client Injection

Following the wallet provider pattern, bridge clients are **instantiated by developers** and passed to Actions SDK. This keeps API keys out of Actions SDK.

The native bridge is the **default** and requires no configuration. For L2 ↔ L2 transfers or advanced routing, developers can configure custom bridge providers.

### Example: Native Bridge (Default - No Client Needed)

The native bridge handles L1 ↔ L2 transfers using Optimism's StandardBridge contracts. It is the default and requires no configuration.

```typescript
const actions = createActions({
  wallet: { /* ... */ },
  chains: [
    { chainId: 1, rpcUrl: '...' },    // Ethereum L1
    { chainId: 10, rpcUrl: '...' },   // OP Mainnet
  ],
  // bridge defaults to native - no config needed
})
```

### Example: Custom Bridge Provider

Custom bridges support L2 ↔ L2 transfers and advanced routing through third-party aggregators.

```typescript
import { CustomBridgeClient } from 'third-party-bridge-sdk'

// Developer instantiates client with their API key
const bridgeClient = new CustomBridgeClient({
  apiKey: process.env.BRIDGE_API_KEY!,
})

// Pass client to Actions
const actions = createActions({
  wallet: { /* ... */ },
  chains: [
    { chainId: 10, rpcUrl: '...' },     // OP Mainnet
    { chainId: 8453, rpcUrl: '...' },   // Base
  ],
  bridge: {
    type: 'custom',
    client: bridgeClient,  // ← Actions never sees API key
  }
})
```

---

## Types and Interfaces

### Bridge Client Interface

```typescript
// packages/sdk/src/bridge/types/client.ts

export interface BridgeClient {
  /**
   * Get quote for a cross-chain transfer
   */
  getQuote(params: BridgeQuoteRequest): Promise<BridgeQuoteResponse>

  /**
   * Build transaction for execution
   */
  buildTransaction(params: BridgeBuildTxRequest): Promise<BridgeTransactionResponse>

  /**
   * Get supported routes (optional - can be cached)
   */
  getSupportedRoutes?(): Promise<BridgeRouteInfo[]>
}

// Provider-agnostic requests/responses
export interface BridgeQuoteRequest {
  fromChainId: number
  toChainId: number
  fromTokenAddress: string
  toTokenAddress: string
  fromAmount: string
  userAddress: string
}

export interface BridgeQuoteResponse {
  fromAmount: string
  toAmount: string
  estimatedTime: number  // seconds
  gasFees?: {
    gasAmount: string
    gasLimit: string
  }
  route: any  // Provider-specific route data
}

export interface BridgeBuildTxRequest {
  route: any  // Provider-specific route from quote
}

export interface BridgeTransactionResponse {
  txTarget: string      // Contract to call
  txData: string        // Calldata
  value?: string        // ETH value
  approvalData?: {
    approvalTokenAddress: string
    allowanceTarget: string
    approvalData: string
  }
}
```

### Configuration Types

```typescript
// packages/sdk/src/types/bridge/config.ts

import type { Address } from 'viem'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type { BridgeClient } from '@/bridge/types/client.js'

/**
 * Bridge provider configuration
 */
export interface BridgeProviderConfig {
  /** Maximum acceptable fee as percentage (e.g., 0.01 for 1%) */
  maxFeePercent?: number
  /** Allowlist of bridge routes (optional) */
  routeAllowlist?: BridgeRouteConfig[]
  /** Blocklist of bridge routes to exclude */
  routeBlocklist?: BridgeRouteConfig[]
}

/**
 * Bridge route configuration
 */
export interface BridgeRouteConfig {
  /** Asset to bridge */
  asset: Asset
  /** Source chain */
  fromChainId: SupportedChainId
  /** Destination chain */
  toChainId: SupportedChainId
}
```

### ActionsConfig Extension

```typescript
// packages/sdk/src/types/actions.ts (additions)

import type { BridgeClient } from '@/bridge/types/client.js'
import type { BridgeProviderConfig } from '@/types/bridge/config.js'

/**
 * Bridge configuration
 */
export interface BridgeConfig {
  /** Bridge provider type ('native' or 'custom') */
  type?: 'native' | 'custom'

  /** Custom bridge client instance (required if type === 'custom') */
  client?: BridgeClient

  /** Provider configuration */
  config?: BridgeProviderConfig
}

/**
 * Actions SDK configuration (updated)
 */
export interface ActionsConfig<
  THostedWalletProviderType extends string,
  TConfigMap extends { [K in THostedWalletProviderType]: unknown },
> {
  wallet: WalletConfig<THostedWalletProviderType, TConfigMap>
  lend?: LendConfig
  swap?: SwapConfig
  bridge?: BridgeConfig  // NEW
  assets?: AssetsConfig
  chains: ChainConfig[]
}
```

### Bridge Operation Types

```typescript
// packages/sdk/src/types/bridge/base.ts

import type {
  TransactionReturnType,
  BatchTransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

/**
 * Parameters for getting a bridge quote
 */
export interface BridgeQuoteParams {
  /** Asset to bridge */
  asset: Asset
  /** Amount to bridge (human-readable) */
  amount: number
  /** Source chain */
  fromChainId: SupportedChainId
  /** Destination chain */
  toChainId: SupportedChainId
  /** Recipient address (optional, defaults to sender) */
  to?: Address
}

/**
 * Internal bridge quote params with wei amounts
 */
export interface BridgeQuoteInternalParams {
  asset: Asset
  amountWei: bigint
  fromChainId: SupportedChainId
  toChainId: SupportedChainId
  to?: Address
  walletAddress: Address
}

/**
 * Bridge quote response
 */
export interface BridgeQuote {
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
  /** Gas estimate for source chain transaction (wei) */
  gasEstimate?: bigint
  /** Provider identifier */
  provider: string
}

/**
 * Parameters for executing a bridge
 */
export interface BridgeExecuteParams {
  /** Amount to bridge (human-readable) */
  amount: number
  /** Asset to bridge */
  asset: Asset
  /** Recipient address */
  to: Address
  /** Source chain */
  fromChainId: SupportedChainId
  /** Destination chain */
  toChainId: SupportedChainId
}

/**
 * Internal bridge execution params
 */
export interface BridgeExecuteInternalParams {
  amountWei: bigint
  asset: Asset
  to: Address
  fromChainId: SupportedChainId
  toChainId: SupportedChainId
  walletAddress: Address
}

/**
 * Transaction data for bridge execution
 */
export interface BridgeTransactionData {
  /** Token approval (if needed) */
  approval?: TransactionData
  /** Main bridge transaction */
  bridge: TransactionData
}

/**
 * Bridge transaction result
 */
export interface BridgeTransaction {
  /** Input amount (wei) */
  amountIn: bigint
  /** Expected output amount (wei) */
  amountOut: bigint
  /** Asset being bridged */
  asset: Asset
  /** Recipient address */
  to: Address
  /** Source chain */
  fromChainId: SupportedChainId
  /** Destination chain */
  toChainId: SupportedChainId
  /** Bridge fee (wei) */
  fee: bigint
  /** Estimated arrival time (Unix timestamp) */
  estimatedArrival?: number
  /** Transaction data for execution */
  transactionData: BridgeTransactionData
  /** Provider used */
  provider: string
}

/**
 * Bridge execution receipt
 */
export interface BridgeReceipt {
  /** Transaction receipt */
  receipt: TransactionReturnType | BatchTransactionReturnType
  /** Amount sent (wei) */
  amountIn: bigint
  /** Expected amount to receive (wei) */
  amountOut: bigint
  /** Asset bridged */
  asset: Asset
  /** Recipient */
  to: Address
  /** Source chain */
  fromChainId: SupportedChainId
  /** Destination chain */
  toChainId: SupportedChainId
  /** Bridge fee (wei) */
  fee: bigint
  /** Provider used */
  provider: string
  /** Estimated arrival time (Unix timestamp) */
  estimatedArrival?: number
  /** Tracking URL (if available) */
  trackingUrl?: string
}

/**
 * Supported bridge route
 */
export interface BridgeRoute {
  /** Asset that can be bridged */
  asset: Asset
  /** Source chain */
  fromChainId: SupportedChainId
  /** Destination chain */
  toChainId: SupportedChainId
  /** Provider supporting this route */
  provider: string
}
```

### Enhanced Send Types

```typescript
// packages/sdk/src/wallet/core/wallets/abstract/types/index.ts (additions)

/**
 * Enhanced send parameters with bridge support
 */
export interface SendParams {
  /** Amount to send (human-readable) */
  amount: number
  /** Asset to transfer */
  asset: Asset
  /** Recipient address */
  to: Address

  // Single-chain transfer (existing)
  /** Chain ID for single-chain transfer. Mutually exclusive with fromChainId/toChainId. */
  chainId?: SupportedChainId

  // Cross-chain transfer (new)
  /** Source chain ID. Required for cross-chain transfers. */
  fromChainId?: SupportedChainId
  /** Destination chain ID. Triggers bridge when different from fromChainId. */
  toChainId?: SupportedChainId
}

/**
 * Send receipt (single-chain)
 */
export interface SendReceipt {
  receipt: TransactionReturnType
  amount: bigint
  asset: Asset
  to: Address
  chainId: SupportedChainId
}
```

---

## Core Classes

### BridgeProvider Abstract Base Class

```typescript
// packages/sdk/src/bridge/core/BridgeProvider.ts

import type { Address } from 'viem'
import { parseUnits } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type {
  BridgeProviderConfig,
  BridgeQuoteParams,
  BridgeQuoteInternalParams,
  BridgeQuote,
  BridgeExecuteInternalParams,
  BridgeTransaction,
  BridgeRouteConfig,
  BridgeRoute,
} from '@/types/bridge/base.js'
import { isAssetSupportedOnChain } from '@/utils/assets.js'

/**
 * Abstract base class for bridge providers
 */
export abstract class BridgeProvider<
  TConfig extends BridgeProviderConfig = BridgeProviderConfig,
> {
  protected readonly _config: TConfig
  protected readonly chainManager: ChainManager

  constructor(config: TConfig, chainManager: ChainManager) {
    this._config = config
    this.chainManager = chainManager
  }

  /** Provider configuration */
  get config(): TConfig {
    return this._config
  }

  /** Provider name (e.g., 'native', 'custom') */
  abstract readonly name: string

  /**
   * Get a quote for a bridge transfer
   */
  async quote(params: BridgeQuoteParams): Promise<BridgeQuote> {
    this.validateRoute(params.asset, params.fromChainId, params.toChainId)

    const amountWei = parseUnits(
      params.amount.toString(),
      params.asset.metadata.decimals
    )

    const quote = await this._getQuote({
      ...params,
      amountWei,
      walletAddress: params.to, // Will be overridden in execute
    })

    // Validate fee doesn't exceed max
    if (this._config.maxFeePercent !== undefined) {
      if (quote.feePercent > this._config.maxFeePercent) {
        throw new Error(
          `Bridge fee ${(quote.feePercent * 100).toFixed(2)}% exceeds ` +
          `maximum ${(this._config.maxFeePercent * 100).toFixed(2)}%`
        )
      }
    }

    return quote
  }

  /**
   * Execute a bridge transfer
   */
  async execute(params: BridgeExecuteInternalParams): Promise<BridgeTransaction> {
    this.validateRoute(params.asset, params.fromChainId, params.toChainId)

    // Validate asset is supported on both chains
    if (!isAssetSupportedOnChain(params.asset, params.fromChainId)) {
      throw new Error(
        `Asset ${params.asset.metadata.symbol} not supported on chain ${params.fromChainId}`
      )
    }
    if (!isAssetSupportedOnChain(params.asset, params.toChainId)) {
      throw new Error(
        `Asset ${params.asset.metadata.symbol} not supported on chain ${params.toChainId}`
      )
    }

    return this._execute(params)
  }

  /**
   * Get all supported routes for this provider
   */
  abstract supportedRoutes(): BridgeRoute[]

  /**
   * Check if a route is supported
   */
  isRouteSupported(
    asset: Asset,
    fromChainId: SupportedChainId,
    toChainId: SupportedChainId
  ): boolean {
    return this.supportedRoutes().some(
      (route) =>
        route.asset.metadata.symbol === asset.metadata.symbol &&
        route.fromChainId === fromChainId &&
        route.toChainId === toChainId
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Protected abstract methods (implement in provider)
  // ─────────────────────────────────────────────────────────────────────────────

  protected abstract _getQuote(
    params: BridgeQuoteInternalParams
  ): Promise<BridgeQuote>

  protected abstract _execute(
    params: BridgeExecuteInternalParams
  ): Promise<BridgeTransaction>

  // ─────────────────────────────────────────────────────────────────────────────
  // Protected validation helpers
  // ─────────────────────────────────────────────────────────────────────────────

  protected validateRoute(
    asset: Asset,
    fromChainId: SupportedChainId,
    toChainId: SupportedChainId
  ): void {
    // Can't bridge to same chain
    if (fromChainId === toChainId) {
      throw new Error('Cannot bridge to the same chain')
    }

    // Check if route is supported by provider
    if (!this.isRouteSupported(asset, fromChainId, toChainId)) {
      throw new Error(
        `Route not supported: ${asset.metadata.symbol} from chain ${fromChainId} to ${toChainId}`
      )
    }

    // Check blocklist
    if (this._config.routeBlocklist?.length) {
      const isBlocked = this.isRouteInList(
        asset,
        fromChainId,
        toChainId,
        this._config.routeBlocklist
      )
      if (isBlocked) {
        throw new Error(
          `Route blocked: ${asset.metadata.symbol} from chain ${fromChainId} to ${toChainId}`
        )
      }
    }

    // Check allowlist if configured
    if (this._config.routeAllowlist?.length) {
      const isAllowed = this.isRouteInList(
        asset,
        fromChainId,
        toChainId,
        this._config.routeAllowlist
      )
      if (!isAllowed) {
        throw new Error(
          `Route not in allowlist: ${asset.metadata.symbol} from chain ${fromChainId} to ${toChainId}`
        )
      }
    }
  }

  private isRouteInList(
    asset: Asset,
    fromChainId: SupportedChainId,
    toChainId: SupportedChainId,
    list: BridgeRouteConfig[]
  ): boolean {
    return list.some(
      (config) =>
        config.asset.metadata.symbol === asset.metadata.symbol &&
        config.fromChainId === fromChainId &&
        config.toChainId === toChainId
    )
  }
}
```

### NativeBridgeProvider Implementation

```typescript
// packages/sdk/src/bridge/providers/native/NativeBridgeProvider.ts

import type { Address } from 'viem'
import { encodeFunctionData } from 'viem'

import { BridgeProvider } from '@/bridge/core/BridgeProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  BridgeProviderConfig,
  BridgeQuoteInternalParams,
  BridgeQuote,
  BridgeExecuteInternalParams,
  BridgeTransaction,
  BridgeRoute,
  TransactionData,
} from '@/types/bridge/base.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'
import { getNativeBridgeAddresses, SUPPORTED_ROUTES } from './addresses.js'
import { estimateBridgeGas, estimateBridgeTime } from './sdk.js'

/**
 * Optimism/Base Native Bridge Provider
 * @description Uses the official Optimism bridge for L1↔L2 transfers.
 * Zero fees (gas only), but longer finality times especially L2→L1.
 */
export class NativeBridgeProvider extends BridgeProvider<BridgeProviderConfig> {
  readonly name = 'native'

  constructor(config: BridgeProviderConfig, chainManager: ChainManager) {
    super(config, chainManager)
  }

  supportedRoutes(): BridgeRoute[] {
    return SUPPORTED_ROUTES
  }

  protected async _getQuote(
    params: BridgeQuoteInternalParams
  ): Promise<BridgeQuote> {
    const { asset, amountWei, fromChainId, toChainId } = params

    // Native bridge has 0% fees (only gas)
    const amountOut = amountWei
    const fee = 0n
    const feePercent = 0

    // Estimate gas
    const addresses = getNativeBridgeAddresses(fromChainId)
    const publicClient = this.chainManager.getPublicClient(fromChainId)
    const gasEstimate = await estimateBridgeGas({
      asset,
      amount: amountWei,
      fromChainId,
      toChainId,
      publicClient,
      bridgeAddress: addresses.bridge,
    })

    // Estimate time based on direction
    const estimatedTime = estimateBridgeTime(fromChainId, toChainId)

    return {
      amountIn: amountWei,
      amountOut,
      fee,
      feePercent,
      estimatedTime,
      gasEstimate,
      provider: this.name,
    }
  }

  protected async _execute(
    params: BridgeExecuteInternalParams
  ): Promise<BridgeTransaction> {
    const { amountWei, asset, to, fromChainId, toChainId, walletAddress } = params

    const addresses = getNativeBridgeAddresses(fromChainId)
    const assetAddress = isNativeAsset(asset)
      ? undefined
      : getAssetAddress(asset, fromChainId)

    // Get quote for amounts
    const quote = await this._getQuote({
      asset,
      amountWei,
      fromChainId,
      toChainId,
      to,
      walletAddress,
    })

    // Build bridge transaction
    let approval: TransactionData | undefined
    let bridgeTx: TransactionData

    if (isNativeAsset(asset)) {
      // Bridge ETH
      bridgeTx = {
        to: addresses.bridge,
        data: encodeFunctionData({
          abi: NATIVE_BRIDGE_ABI,
          functionName: 'bridgeETH',
          args: [to, 200_000n, '0x'], // min gas limit, extra data
        }),
        value: amountWei,
      }
    } else {
      // Bridge ERC20
      // Check if approval needed
      const publicClient = this.chainManager.getPublicClient(fromChainId)
      const allowance = await publicClient.readContract({
        address: assetAddress!,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [walletAddress, addresses.bridge],
      })

      if (allowance < amountWei) {
        approval = {
          to: assetAddress!,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [addresses.bridge, amountWei],
          }),
          value: 0n,
        }
      }

      bridgeTx = {
        to: addresses.bridge,
        data: encodeFunctionData({
          abi: NATIVE_BRIDGE_ABI,
          functionName: 'bridgeERC20',
          args: [assetAddress!, assetAddress!, amountWei, to, 200_000n, '0x'],
        }),
        value: 0n,
      }
    }

    const estimatedArrival = Math.floor(Date.now() / 1000) + quote.estimatedTime

    return {
      amountIn: amountWei,
      amountOut: quote.amountOut,
      asset,
      to,
      fromChainId,
      toChainId,
      fee: 0n,
      estimatedArrival,
      transactionData: {
        approval,
        bridge: bridgeTx,
      },
      provider: this.name,
    }
  }
}

// ABIs
const NATIVE_BRIDGE_ABI = [
  {
    name: 'bridgeETH',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_minGasLimit', type: 'uint32' },
      { name: '_extraData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'bridgeERC20',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_localToken', type: 'address' },
      { name: '_remoteToken', type: 'address' },
      { name: '_amount', type: 'uint256' },
      { name: '_to', type: 'address' },
      { name: '_minGasLimit', type: 'uint32' },
      { name: '_extraData', type: 'bytes' },
    ],
    outputs: [],
  },
] as const

const ERC20_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: '_amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const
```

---

### Superchain Bridge Addresses

The SDK includes StandardBridge contract addresses for all Superchain networks, sourced from the [Superchain Registry](https://github.com/ethereum-optimism/superchain-registry).

#### L2StandardBridge (Predeploy)

All OP Stack chains use a standardized predeploy address for the L2StandardBridge:

```typescript
// packages/sdk/src/bridge/providers/native/addresses.ts

/**
 * L2StandardBridge predeploy address - same across all OP Stack chains
 * See: https://docs.optimism.io/stack/protocol/predeploys
 */
export const L2_STANDARD_BRIDGE = '0x4200000000000000000000000000000000000010' as const
```

#### L1StandardBridge Addresses

Each L2 chain has a unique L1StandardBridge contract on Ethereum:

```typescript
// packages/sdk/src/bridge/providers/native/addresses.ts

/**
 * L1StandardBridge addresses for each Superchain network
 * Source: https://github.com/ethereum-optimism/superchain-registry
 */
export const L1_STANDARD_BRIDGES: Record<number, Address> = {
  // Mainnet chains
  10: '0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1',     // OP Mainnet
  8453: '0x3154Cf16ccdb4C6d922629664174b904d80F2C35',   // Base
  34443: '0x735aDBbE72226BD52e818E7181953f42E3b0FF21',  // Mode
  252: '0x34C0bD5877A5Ee7099D0f5688D65F4bB9158BDE2',    // Fraxtal
  42220: '0x9C4955b92F34148dbcfDCD82e9c9eCe5CF2badfe',  // Celo (OP Stack)

  // Testnet chains
  11155420: '0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1', // OP Sepolia
  84532: '0xfd0Bf71F60660E2f608ed56e1659C450eB113120',   // Base Sepolia
} as const

/**
 * Get bridge addresses for a given chain
 */
export function getNativeBridgeAddresses(chainId: number): {
  l1Bridge: Address
  l2Bridge: Address
} {
  const l1Bridge = L1_STANDARD_BRIDGES[chainId]
  if (!l1Bridge) {
    throw new Error(`No native bridge found for chain ${chainId}`)
  }

  return {
    l1Bridge,
    l2Bridge: L2_STANDARD_BRIDGE,
  }
}
```

#### Supported Routes

The native bridge only supports **L1 ↔ L2** transfers, NOT direct L2 ↔ L2 transfers:

```typescript
// packages/sdk/src/bridge/providers/native/addresses.ts

/**
 * Supported native bridge routes
 * Note: Native bridge only supports L1 ↔ L2, not L2 ↔ L2
 */
export const SUPPORTED_ROUTES: BridgeRoute[] = [
  // Mainnet routes (all L1 ↔ L2)
  { fromChainId: 1, toChainId: 10, provider: 'native' },     // ETH → OP Mainnet
  { fromChainId: 10, toChainId: 1, provider: 'native' },     // OP Mainnet → ETH
  { fromChainId: 1, toChainId: 8453, provider: 'native' },   // ETH → Base
  { fromChainId: 8453, toChainId: 1, provider: 'native' },   // Base → ETH
  { fromChainId: 1, toChainId: 34443, provider: 'native' },  // ETH → Mode
  { fromChainId: 34443, toChainId: 1, provider: 'native' },  // Mode → ETH

  // Testnet routes (all L1 ↔ L2)
  { fromChainId: 11155111, toChainId: 11155420, provider: 'native' }, // Sepolia → OP Sepolia
  { fromChainId: 11155420, toChainId: 11155111, provider: 'native' }, // OP Sepolia → Sepolia
  { fromChainId: 11155111, toChainId: 84532, provider: 'native' },    // Sepolia → Base Sepolia
  { fromChainId: 84532, toChainId: 11155111, provider: 'native' },    // Base Sepolia → Sepolia

  // Note: For L2 ↔ L2 (e.g., Base → OP Mainnet), use a custom bridge provider
]
```

**Important:** To bridge from Base to OP Mainnet (or any L2 ↔ L2), developers must use a custom bridge provider that supports direct L2-to-L2 routing (e.g., Socket, Across, etc.).

---

### Custom Bridge Provider (Example Implementation)

```typescript
// packages/sdk/src/bridge/providers/custom/CustomBridgeProvider.ts

import { BridgeProvider } from '@/bridge/core/BridgeProvider.js'
import type { BridgeClient } from '@/bridge/types/client.js'
import type { ChainManager } from '@/services/ChainManager.js'

/**
 * Custom Bridge Provider using injected client
 * @description Wraps a third-party bridge client implementing BridgeClient interface
 */
export class CustomBridgeProvider extends BridgeProvider {
  readonly name = 'custom'
  private readonly client: BridgeClient

  constructor(
    config: BridgeProviderConfig,
    chainManager: ChainManager,
    client: BridgeClient  // ← Injected by developer
  ) {
    super(config, chainManager)
    this.client = client
  }

  protected async _getQuote(
    params: BridgeQuoteInternalParams
  ): Promise<BridgeQuote> {
    // Use injected client
    const response = await this.client.getQuote({
      fromChainId: params.fromChainId,
      toChainId: params.toChainId,
      fromTokenAddress: getAssetAddress(params.asset, params.fromChainId),
      toTokenAddress: getAssetAddress(params.asset, params.toChainId),
      fromAmount: params.amountWei.toString(),
      userAddress: params.walletAddress,
    })

    // Transform response to Actions format
    return {
      amountIn: BigInt(response.fromAmount),
      amountOut: BigInt(response.toAmount),
      fee: BigInt(response.fromAmount) - BigInt(response.toAmount),
      feePercent: this.calculateFeePercent(response),
      estimatedTime: response.estimatedTime,
      gasEstimate: response.gasFees
        ? BigInt(response.gasFees.gasAmount)
        : undefined,
      provider: 'custom',
    }
  }

  protected async _execute(
    params: BridgeExecuteInternalParams
  ): Promise<BridgeTransaction> {
    // Get quote first to get route
    const quote = await this._getQuote(params)

    // Build transaction using injected client
    const txData = await this.client.buildTransaction({
      route: quote.meta?.route,
    })

    // Transform to Actions format
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
        },
      },
      provider: 'custom',
    }
  }

  supportedRoutes(): BridgeRoute[] {
    // Could call client.getSupportedRoutes() if available
    // Or return cached/hardcoded list
    return []
  }

  private calculateFeePercent(response: BridgeQuoteResponse): number {
    const amountIn = BigInt(response.fromAmount)
    const amountOut = BigInt(response.toAmount)
    const fee = amountIn - amountOut
    return Number(fee * 10000n / amountIn) / 10000
  }
}
```

---

## Enhanced wallet.send() Implementation

See the design review document for the complete `wallet.send()` implementation with smart chain detection logic.

Key features:
- Auto-detect source chain from wallet balances
- Detect bridge when `fromChainId !== toChainId`
- Execute same-chain or bridge transfer accordingly

---

## Actions Class Integration

```typescript
// packages/sdk/src/actions.ts (additions)

export class Actions {
  private _bridgeProvider?: BridgeProvider

  constructor(config: ActionsConfig, deps: Dependencies) {
    // ... existing setup ...

    // Initialize bridge provider
    if (config.bridge) {
      this._bridgeProvider = this.createBridgeProvider(config.bridge)
    } else {
      // Default to native bridge
      this._bridgeProvider = new NativeBridgeProvider({}, this.chainManager)
    }
  }

  private createBridgeProvider(
    config: BridgeConfig
  ): BridgeProvider {
    if (!config.type || config.type === 'native') {
      return new NativeBridgeProvider(
        config.config || {},
        this.chainManager
      )
    }

    if (config.type === 'custom') {
      if (!config.client) {
        throw new Error(
          'Custom bridge client required. ' +
          'Initialize bridge client and pass to config.bridge.client'
        )
      }

      return new CustomBridgeProvider(
        config.config || {},
        this.chainManager,
        config.client  // ← Pass developer's client
      )
    }

    throw new Error(`Unknown bridge type: ${config.type}`)
  }

  get bridgeProvider(): BridgeProvider | undefined {
    return this._bridgeProvider
  }
}
```

---

## Testing Requirements

### SDK Tests (Highest Priority)

#### BridgeProvider Base Class Tests

```typescript
// packages/sdk/src/bridge/core/__tests__/BridgeProvider.test.ts

describe('BridgeProvider', () => {
  describe('quote()', () => {
    it('should throw if fromChainId === toChainId')
    it('should throw if route not supported by provider')
    it('should throw if route is blocklisted')
    it('should throw if route not in allowlist (when configured)')
    it('should throw if fee exceeds maxFeePercent')
    it('should convert human-readable amount to wei')
    it('should call _getQuote with correct params')
  })

  describe('execute()', () => {
    it('should throw if route not supported')
    it('should throw if asset not supported on fromChain')
    it('should throw if asset not supported on toChain')
    it('should call _execute with correct params')
  })

  describe('validateRoute()', () => {
    it('should allow valid routes')
    it('should reject same-chain routes')
    it('should reject unsupported routes')
    it('should respect allowlist')
    it('should respect blocklist')
  })
})
```

#### NativeBridgeProvider Tests

```typescript
// packages/sdk/src/bridge/providers/native/__tests__/NativeBridgeProvider.test.ts

describe('NativeBridgeProvider', () => {
  describe('_getQuote()', () => {
    it('should return quote with 0% fee')
    it('should estimate gas correctly')
    it('should estimate time for L1→L2')
    it('should estimate time for L2→L1')
  })

  describe('_execute()', () => {
    it('should build ETH bridge transaction')
    it('should build ERC20 bridge transaction')
    it('should include approval when needed')
    it('should use correct bridge address')
  })

  describe('supportedRoutes()', () => {
    it('should return all supported native bridge routes')
  })
})
```

---

## Acceptance Criteria

### SDK

- [ ] `BridgeProvider` abstract class implemented
- [ ] `NativeBridgeProvider` implemented for OP/Base bridge
- [ ] `BridgeClient` interface defined for custom providers
- [ ] `CustomBridgeProvider` with client injection pattern
- [ ] `wallet.send()` detects and routes cross-chain transfers
- [ ] Smart chain detection from wallet balances
- [ ] Transaction batching works for approval + bridge
- [ ] Route validation (allowlist/blocklist) works
- [ ] Fee validation (maxFeePercent) works
- [ ] All SDK tests passing

### Demo

- [ ] Example custom bridge provider implementation
- [ ] Documentation for integrating third-party bridges
- [ ] Demo shows both native and custom provider usage

---

## Future Considerations

- Additional native bridge provider implementations (Hop, Across direct SDKs)
- Multi-provider support (try multiple providers, select best)
- Intent-based bridging
- Bridge transaction tracking and status updates
- Automatic path finding for multi-hop bridges

---

## References

- [Optimism Native Bridge Documentation](https://docs.optimism.io/app-developers/bridging/standard-bridge)
- [OP Stack Bridges Specification](https://specs.optimism.io/protocol/bridges.html)
- Provider pattern from existing LendProvider and SwapProvider implementations
