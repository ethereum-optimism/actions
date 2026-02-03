# BridgeProvider Feature Specification

## Overview

This specification defines the BridgeProvider abstraction for cross-chain token transfers in the Actions SDK. The implementation integrates with the existing `send()` functionality, automatically detecting and routing cross-chain transfers through appropriate bridge providers.

### Goals

- Enable cross-chain token transfers through a minimal API enhancement
- Follow established patterns from LendProvider and SwapProvider for consistency
- Support multiple bridge providers (Native Bridge, Across Protocol, etc.)
- Provide quotes before execution to show fees and timing
- Handle token approvals transparently
- Integrate seamlessly with existing `wallet.send()` API

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
│   │   ├── native/
│   │   │   ├── NativeBridgeProvider.ts    # Optimism/Base native bridge
│   │   │   ├── sdk.ts                     # Bridge SDK wrapper
│   │   │   ├── addresses.ts               # Contract addresses per chain
│   │   │   └── __tests__/
│   │   │       └── NativeBridgeProvider.test.ts
│   │   └── across/
│   │       ├── AcrossBridgeProvider.ts    # Across Protocol
│   │       ├── sdk.ts                     # Across SDK wrapper
│   │       ├── addresses.ts               # Contract addresses
│   │       └── __tests__/
│   │           └── AcrossBridgeProvider.test.ts
│   ├── namespaces/
│   │   ├── BaseBridgeNamespace.ts         # Shared read-only operations
│   │   ├── ActionsBridgeNamespace.ts      # actions.bridge (no wallet)
│   │   ├── WalletBridgeNamespace.ts       # wallet.bridge (with signing)
│   │   └── __tests__/
│   │       ├── ActionsBridgeNamespace.test.ts
│   │       └── WalletBridgeNamespace.test.ts
│   └── __mocks__/
│       └── MockBridgeProvider.ts
├── types/
│   └── bridge/
│       ├── base.ts                       # Core bridge types
│       ├── native.ts                     # Native bridge types
│       ├── across.ts                     # Across-specific types
│       └── index.ts                      # Re-exports
```

### Pattern Reference

This implementation mirrors the established provider pattern:

| LendProvider | SwapProvider | BridgeProvider |
|--------------|--------------|----------------|
| `LendProvider` abstract class | `SwapProvider` abstract class | `BridgeProvider` abstract class |
| `MorphoLendProvider` | `UniswapSwapProvider` | `NativeBridgeProvider` |
| `AaveLendProvider` | - | `AcrossBridgeProvider` |
| `ActionsLendNamespace` | `ActionsSwapNamespace` | `ActionsBridgeNamespace` |
| `WalletLendNamespace` | `WalletSwapNamespace` | `WalletBridgeNamespace` |

### Multi-Provider Aggregation

The BridgeProvider system supports multiple providers simultaneously:

| Method | Behavior |
|--------|----------|
| `supportedRoutes()` | Returns routes from ALL providers |
| `quotes(params)` | Returns quotes from ALL providers, sorted by best output |
| `quote(params)` | Returns quote from best provider for the route |
| `execute(params)` | Uses specified provider or auto-selects best |

---

## Types and Interfaces

### Configuration Types

```typescript
// packages/sdk/src/types/bridge/base.ts

import type { Address } from 'viem'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

/**
 * Bridge provider configuration
 */
export interface BridgeProviderConfig {
  /** Enable this bridge provider */
  enabled?: boolean
  /** Maximum acceptable fee as percentage (e.g., 0.01 for 1%). Rejects quotes above this. */
  maxFeePercent?: number
  /** Allowlist of bridge routes (optional - defaults to all supported routes) */
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

import type { BridgeProviderConfig } from '@/types/bridge/index.js'

/**
 * Bridge configuration
 */
export interface BridgeConfig {
  /** Optimism/Base Native Bridge */
  native?: BridgeProviderConfig
  /** Across Protocol bridge */
  across?: BridgeProviderConfig
  // Future providers added here
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
// packages/sdk/src/types/bridge/base.ts (continued)

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
  /** Preferred provider (optional, auto-selects best if not specified) */
  provider?: string
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

  /** Preferred bridge provider (optional, auto-selects if not specified) */
  bridgeProvider?: string
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

  /** Provider name (e.g., 'native', 'across') */
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
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const
```

### Bridge Addresses

```typescript
// packages/sdk/src/bridge/providers/native/addresses.ts

import type { Address } from 'viem'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { BridgeRoute } from '@/types/bridge/base.js'
import { ETH, USDC, USDT } from '@/supported/tokens.js'

interface NativeBridgeAddresses {
  bridge: Address
  messenger: Address
}

const NATIVE_BRIDGE_ADDRESSES: Partial<
  Record<SupportedChainId, NativeBridgeAddresses>
> = {
  // Base Sepolia (L2)
  84532: {
    bridge: '0x4200000000000000000000000000000000000010', // L2StandardBridge
    messenger: '0x4200000000000000000000000000000000000007', // L2CrossDomainMessenger
  },
  // OP Sepolia (L2)
  11155420: {
    bridge: '0x4200000000000000000000000000000000000010', // L2StandardBridge
    messenger: '0x4200000000000000000000000000000000000007', // L2CrossDomainMessenger
  },
  // Ethereum Sepolia (L1)
  11155111: {
    bridge: '0xfd0Bf71F60660E2f608ed56e1659C450eB113120', // L1StandardBridge (Base)
    messenger: '0xC34855F4De64F1840e5686e64278da901e261f20', // L1CrossDomainMessenger
  },
  // Add mainnet addresses as needed
}

/**
 * Get native bridge contract addresses for a chain
 */
export function getNativeBridgeAddresses(
  chainId: SupportedChainId
): NativeBridgeAddresses {
  const addresses = NATIVE_BRIDGE_ADDRESSES[chainId]
  if (!addresses) {
    throw new Error(`Native bridge not available on chain ${chainId}`)
  }
  return addresses
}

/**
 * Supported native bridge routes
 */
export const SUPPORTED_ROUTES: BridgeRoute[] = [
  // Base Sepolia ↔ OP Sepolia
  { asset: ETH, fromChainId: 84532, toChainId: 11155420, provider: 'native' },
  { asset: USDC, fromChainId: 84532, toChainId: 11155420, provider: 'native' },
  { asset: USDT, fromChainId: 84532, toChainId: 11155420, provider: 'native' },
  { asset: ETH, fromChainId: 11155420, toChainId: 84532, provider: 'native' },
  { asset: USDC, fromChainId: 11155420, toChainId: 84532, provider: 'native' },
  { asset: USDT, fromChainId: 11155420, toChainId: 84532, provider: 'native' },
  // Add mainnet routes as needed
]
```

### Bridge SDK Helpers

```typescript
// packages/sdk/src/bridge/providers/native/sdk.ts

import type { PublicClient } from 'viem'
import type { Asset } from '@/types/asset.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Address } from 'viem'

/**
 * Estimate gas for native bridge transaction
 */
export async function estimateBridgeGas(params: {
  asset: Asset
  amount: bigint
  fromChainId: SupportedChainId
  toChainId: SupportedChainId
  publicClient: PublicClient
  bridgeAddress: Address
}): Promise<bigint> {
  // Simplified gas estimation
  // Real implementation would simulate the transaction
  return 200_000n
}

/**
 * Estimate bridge time based on direction
 */
export function estimateBridgeTime(
  fromChainId: SupportedChainId,
  toChainId: SupportedChainId
): number {
  // L1 → L2: ~10 minutes
  // L2 → L1: ~7 days (with fault proofs)
  // L2 → L2: Not supported via native bridge

  // Simplified: assume L1 is Sepolia (11155111)
  const isL1ToL2 = fromChainId === 11155111
  const isL2ToL1 = toChainId === 11155111

  if (isL1ToL2) return 600 // 10 minutes
  if (isL2ToL1) return 604800 // 7 days

  throw new Error('Unsupported route for native bridge')
}
```

---

## Namespace Implementation

### BaseBridgeNamespace

```typescript
// packages/sdk/src/bridge/namespaces/BaseBridgeNamespace.ts

import type { BridgeProvider } from '@/bridge/core/BridgeProvider.js'
import type { BridgeProviderConfig } from '@/types/bridge/base.js'
import type {
  BridgeQuoteParams,
  BridgeQuote,
  BridgeRoute,
} from '@/types/bridge/base.js'

/**
 * Bridge providers registry
 */
export type BridgeProviders = {
  native?: BridgeProvider<BridgeProviderConfig>
  across?: BridgeProvider<BridgeProviderConfig>
  // Future providers
}

/**
 * Base bridge namespace with shared read-only operations
 */
export abstract class BaseBridgeNamespace {
  constructor(protected readonly providers: BridgeProviders) {}

  /**
   * Get quote from best provider for a route
   */
  async quote(params: BridgeQuoteParams): Promise<BridgeQuote> {
    const provider = this.getBestProviderForRoute(
      params.asset,
      params.fromChainId,
      params.toChainId
    )
    return provider.quote(params)
  }

  /**
   * Get quotes from all providers for comparison
   */
  async quotes(params: BridgeQuoteParams): Promise<BridgeQuote[]> {
    const providers = this.getProvidersForRoute(
      params.asset,
      params.fromChainId,
      params.toChainId
    )

    const results = await Promise.allSettled(
      providers.map((p) => p.quote(params))
    )

    return results
      .filter((r): r is PromiseFulfilledResult<BridgeQuote> =>
        r.status === 'fulfilled'
      )
      .map((r) => r.value)
      .sort((a, b) => Number(b.amountOut - a.amountOut)) // Best output first
  }

  /**
   * Get all supported routes across all providers
   */
  supportedRoutes(): BridgeRoute[] {
    const allRoutes = this.getAllProviders().flatMap((p) =>
      p.supportedRoutes()
    )
    return allRoutes
  }

  protected getAllProviders(): BridgeProvider<BridgeProviderConfig>[] {
    return Object.values(this.providers).filter(
      (p): p is BridgeProvider<BridgeProviderConfig> => p !== undefined
    )
  }

  protected getProvidersForRoute(
    asset: Asset,
    fromChainId: SupportedChainId,
    toChainId: SupportedChainId
  ): BridgeProvider<BridgeProviderConfig>[] {
    return this.getAllProviders().filter((p) =>
      p.isRouteSupported(asset, fromChainId, toChainId)
    )
  }

  protected getBestProviderForRoute(
    asset: Asset,
    fromChainId: SupportedChainId,
    toChainId: SupportedChainId
  ): BridgeProvider<BridgeProviderConfig> {
    const providers = this.getProvidersForRoute(asset, fromChainId, toChainId)
    if (providers.length === 0) {
      throw new Error(
        `No bridge provider available for ${asset.metadata.symbol} ` +
        `from chain ${fromChainId} to ${toChainId}`
      )
    }
    // For now, return first provider
    // Future: get quotes and compare
    return providers[0]
  }
}
```

### ActionsBridgeNamespace

```typescript
// packages/sdk/src/bridge/namespaces/ActionsBridgeNamespace.ts

import { BaseBridgeNamespace } from './BaseBridgeNamespace.js'

/**
 * Actions bridge namespace (read-only, no wallet required)
 */
export class ActionsBridgeNamespace extends BaseBridgeNamespace {
  // Inherits quote(), quotes(), and supportedRoutes() from BaseBridgeNamespace
}
```

### WalletBridgeNamespace

```typescript
// packages/sdk/src/bridge/namespaces/WalletBridgeNamespace.ts

import type { Address } from 'viem'

import { BaseBridgeNamespace, type BridgeProviders } from './BaseBridgeNamespace.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  BridgeExecuteParams,
  BridgeReceipt,
  BridgeTransaction,
} from '@/types/bridge/base.js'
import { parseUnits } from 'viem'

/**
 * Wallet bridge namespace (execution with signing)
 */
export class WalletBridgeNamespace extends BaseBridgeNamespace {
  constructor(
    providers: BridgeProviders,
    private readonly wallet: Wallet
  ) {
    super(providers)
  }

  /**
   * Execute a cross-chain bridge transfer
   */
  async execute(params: BridgeExecuteParams): Promise<BridgeReceipt> {
    // Select provider
    const provider = params.provider
      ? this.getProviderByName(params.provider)
      : this.getBestProviderForRoute(
          params.asset,
          params.fromChainId,
          params.toChainId
        )

    // Convert amount to wei
    const amountWei = parseUnits(
      params.amount.toString(),
      params.asset.metadata.decimals
    )

    // Build bridge transaction
    const bridgeTx = await provider.execute({
      amountWei,
      asset: params.asset,
      to: params.to,
      fromChainId: params.fromChainId,
      toChainId: params.toChainId,
      walletAddress: this.wallet.address,
    })

    // Execute transaction(s)
    const receipt = await this.executeTransaction(bridgeTx)

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

  private async executeTransaction(
    bridgeTx: BridgeTransaction
  ): Promise<BridgeReceipt['receipt']> {
    const { transactionData, fromChainId } = bridgeTx
    const txs = []

    // Add approval if needed
    if (transactionData.approval) {
      txs.push(transactionData.approval)
    }

    // Add bridge transaction
    txs.push(transactionData.bridge)

    // Execute as batch if multiple transactions
    if (txs.length > 1) {
      return this.wallet.sendBatch(txs, fromChainId)
    }
    return this.wallet.send(transactionData.bridge, fromChainId)
  }

  private getProviderByName(name: string): BridgeProvider {
    const provider = this.getAllProviders().find((p) => p.name === name)
    if (!provider) {
      throw new Error(`Bridge provider '${name}' not found`)
    }
    return provider
  }

  private getTrackingUrl(bridgeTx: BridgeTransaction): string | undefined {
    // Provider-specific tracking URLs
    if (bridgeTx.provider === 'native') {
      // Optimism bridge tracker
      return `https://superscan.network/tx/${bridgeTx.fromChainId}/pending`
    }
    if (bridgeTx.provider === 'across') {
      // Across bridge tracker
      return 'https://across.to/transactions'
    }
    return undefined
  }
}
```

---

## Wallet Integration

### Enhanced send() Method

```typescript
// packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts (additions)

import { WalletBridgeNamespace } from '@/bridge/namespaces/WalletBridgeNamespace.js'
import type { BridgeProviders } from '@/bridge/namespaces/BaseBridgeNamespace.js'
import type { SendParams, SendReceipt } from './types/index.js'
import type { BridgeReceipt } from '@/types/bridge/base.js'
import { parseUnits } from 'viem'

export abstract class Wallet {
  // ... existing code ...

  private _bridge?: WalletBridgeNamespace

  protected initializeBridge(providers: BridgeProviders): void {
    if (Object.keys(providers).length > 0) {
      this._bridge = new WalletBridgeNamespace(providers, this)
    }
  }

  /**
   * Bridge namespace for cross-chain transfers
   */
  get bridge(): WalletBridgeNamespace | undefined {
    return this._bridge
  }

  /**
   * Enhanced send method with bridge support
   * @description Send tokens on a single chain or bridge across chains.
   * When fromChainId and toChainId are provided and different, automatically
   * routes through the bridge system.
   */
  async sendEnhanced(
    params: SendParams
  ): Promise<SendReceipt | BridgeReceipt> {
    // Determine if this is a bridge transaction
    const isBridge =
      params.fromChainId !== undefined &&
      params.toChainId !== undefined &&
      params.fromChainId !== params.toChainId

    if (isBridge) {
      // Bridge transaction
      if (!this._bridge) {
        throw new Error('Bridge not configured for this wallet')
      }

      return this._bridge.execute({
        amount: params.amount,
        asset: params.asset,
        to: params.to,
        fromChainId: params.fromChainId!,
        toChainId: params.toChainId!,
        bridgeProvider: params.bridgeProvider,
      })
    } else {
      // Single-chain transaction
      const chainId = params.chainId ?? params.fromChainId
      if (!chainId) {
        throw new Error('chainId or fromChainId must be provided')
      }

      const amountWei = parseUnits(
        params.amount.toString(),
        params.asset.metadata.decimals
      )

      const assetAddress = getAssetAddress(params.asset, chainId)

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
  }
}
```

---

## Actions Class Integration

```typescript
// packages/sdk/src/actions.ts (additions)

import type { BridgeConfig } from '@/types/actions.js'
import { NativeBridgeProvider } from '@/bridge/providers/native/NativeBridgeProvider.js'
import { ActionsBridgeNamespace } from '@/bridge/namespaces/ActionsBridgeNamespace.js'
import type { BridgeProviders } from '@/bridge/namespaces/BaseBridgeNamespace.js'

export class Actions {
  // ... existing code ...

  private _bridgeProviders: BridgeProviders = {}
  private _bridge?: ActionsBridgeNamespace

  constructor(config: ActionsConfig, deps: { hostedWalletProviderRegistry }) {
    // ... existing initialization ...

    // Initialize bridge providers
    if (config.bridge?.native?.enabled) {
      this._bridgeProviders.native = new NativeBridgeProvider(
        config.bridge.native,
        this.chainManager
      )
    }
    if (config.bridge?.across?.enabled) {
      this._bridgeProviders.across = new AcrossBridgeProvider(
        config.bridge.across,
        this.chainManager
      )
    }

    // Create bridge namespace if any providers configured
    if (Object.keys(this._bridgeProviders).length > 0) {
      this._bridge = new ActionsBridgeNamespace(this._bridgeProviders)
    }

    // ... pass to wallet provider ...
  }

  /**
   * Bridge namespace for cross-chain transfers (read-only)
   */
  get bridge(): ActionsBridgeNamespace | undefined {
    return this._bridge
  }

  // Expose bridge providers for wallet creation
  get bridgeProviders(): BridgeProviders {
    return this._bridgeProviders
  }
}
```

---

## Demo Backend Integration

### Bridge Service

```typescript
// packages/demo/backend/src/services/bridge.ts

import type {
  BridgeQuoteParams,
  BridgeQuote,
} from '@eth-optimism/actions-sdk'

import { actions } from '@/config/actions.js'

/**
 * Get bridge quote
 */
export async function getBridgeQuote(
  params: BridgeQuoteParams
): Promise<BridgeQuote> {
  if (!actions.bridge) {
    throw new Error('Bridge not configured')
  }

  return actions.bridge.quote(params)
}

/**
 * Get bridge quotes from all providers
 */
export async function getBridgeQuotes(
  params: BridgeQuoteParams
): Promise<BridgeQuote[]> {
  if (!actions.bridge) {
    throw new Error('Bridge not configured')
  }

  return actions.bridge.quotes(params)
}
```

### Enhanced Send Service

```typescript
// packages/demo/backend/src/services/send.ts

import type { SmartWallet, SendParams } from '@eth-optimism/actions-sdk'
import { getWallet } from '@/services/wallet.js'
import { getBlockExplorerUrl } from '@/utils/explorer.js'

/**
 * Send tokens (single-chain or cross-chain)
 */
export async function sendTokens(
  idToken: string,
  params: SendParams
) {
  const wallet = await getWallet(idToken)

  const receipt = await wallet.sendEnhanced(params)

  // Add explorer URL
  const txHash = 'userOpHash' in receipt.receipt
    ? receipt.receipt.receipt.transactionHash
    : receipt.receipt.transactionHash

  const chainId = 'fromChainId' in receipt
    ? receipt.fromChainId
    : receipt.chainId

  return {
    ...receipt,
    explorerUrl: getBlockExplorerUrl(txHash, chainId),
  }
}
```

### Bridge Controller

```typescript
// packages/demo/backend/src/controllers/bridge.ts

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

import { getBridgeQuote, getBridgeQuotes } from '@/services/bridge.js'
import { SUPPORTED_TOKENS } from '@/config/assets.js'

const bridgeRouter = new Hono()

const quoteSchema = z.object({
  assetSymbol: z.string(),
  amount: z.number().positive(),
  fromChainId: z.number(),
  toChainId: z.number(),
  to: z.string().optional(),
})

// Get single quote (best provider)
bridgeRouter.get(
  '/quote',
  zValidator('query', quoteSchema),
  async (c) => {
    const query = c.req.valid('query')

    const asset = SUPPORTED_TOKENS.find(
      (t) => t.metadata.symbol === query.assetSymbol
    )

    if (!asset) {
      return c.json({ error: 'Invalid asset symbol' }, 400)
    }

    const quote = await getBridgeQuote({
      asset,
      amount: query.amount,
      fromChainId: query.fromChainId,
      toChainId: query.toChainId,
      to: query.to,
    })

    return c.json({
      ...quote,
      amountIn: quote.amountIn.toString(),
      amountOut: quote.amountOut.toString(),
      fee: quote.fee.toString(),
      gasEstimate: quote.gasEstimate?.toString(),
    })
  }
)

// Get quotes from all providers
bridgeRouter.get(
  '/quotes',
  zValidator('query', quoteSchema),
  async (c) => {
    const query = c.req.valid('query')

    const asset = SUPPORTED_TOKENS.find(
      (t) => t.metadata.symbol === query.assetSymbol
    )

    if (!asset) {
      return c.json({ error: 'Invalid asset symbol' }, 400)
    }

    const quotes = await getBridgeQuotes({
      asset,
      amount: query.amount,
      fromChainId: query.fromChainId,
      toChainId: query.toChainId,
      to: query.to,
    })

    return c.json(
      quotes.map((q) => ({
        ...q,
        amountIn: q.amountIn.toString(),
        amountOut: q.amountOut.toString(),
        fee: q.fee.toString(),
        gasEstimate: q.gasEstimate?.toString(),
      }))
    )
  }
)

export { bridgeRouter }
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
- [ ] `ActionsBridgeNamespace` provides `quote()`, `quotes()`, `supportedRoutes()`
- [ ] `WalletBridgeNamespace` provides `execute()`
- [ ] `wallet.sendEnhanced()` detects and routes cross-chain transfers
- [ ] Transaction batching works for approval + bridge
- [ ] Route validation (allowlist/blocklist) works
- [ ] Fee validation (maxFeePercent) works
- [ ] All SDK tests passing

### Backend

- [ ] `/bridge/quote` endpoint returns single quote
- [ ] `/bridge/quotes` endpoint returns all provider quotes
- [ ] `/send/execute` endpoint supports cross-chain transfers
- [ ] Bridge config added to actions initialization

### Frontend

- [ ] Enhanced "Pay" tab with chain selectors
- [ ] Bridge quote preview showing fees and time
- [ ] Loading states during quote/bridge
- [ ] Success/error feedback with tracking URLs

---

## Implementation Notes

### Code Style

Follow existing SDK patterns from LendProvider and SwapProvider.

### Dependencies

New packages:
```json
{
  "@eth-optimism/sdk": "^3.x",
  "@across-protocol/sdk": "^1.x"
}
```

### Future Considerations

- Additional bridge providers (Hop, Stargate, LayerZero)
- Intent-based bridging
- Automatic path finding for multi-hop bridges
- Bridge transaction tracking and status updates
