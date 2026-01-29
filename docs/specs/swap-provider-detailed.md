# SwapProvider Feature Specification

## Overview

This specification defines the SwapProvider abstraction for token swapping functionality in the Actions SDK. The initial implementation targets Uniswap via the Universal Router, which automatically routes swaps across V2, V3, and V4 pools for optimal pricing.

### Goals

- Enable single-chain token swaps through a clean, minimal API
- Follow established patterns from LendProvider for consistency
- Support both "exact input" and "exact output" swap types
- Provide price quotes before execution
- Handle token approvals transparently via Permit2
- Integrate with the demo application (frontend tabs, backend endpoints)

---

## Architecture

### Directory Structure

```
packages/sdk/src/
├── swap/
│   ├── core/
│   │   ├── SwapProvider.ts           # Abstract base class
│   │   └── __tests__/
│   │       └── SwapProvider.test.ts
│   ├── providers/
│   │   └── uniswap/
│   │       ├── UniswapSwapProvider.ts    # Uniswap implementation
│   │       ├── sdk.ts                    # SDK wrapper (Universal Router, Quoter)
│   │       ├── permit2.ts                # Permit2 approval helpers
│   │       ├── addresses.ts              # Contract addresses per chain
│   │       └── __tests__/
│   │           └── UniswapSwapProvider.test.ts
│   ├── namespaces/
│   │   ├── BaseSwapNamespace.ts          # Shared read-only operations
│   │   ├── ActionsSwapNamespace.ts       # actions.swap (no wallet)
│   │   ├── WalletSwapNamespace.ts        # wallet.swap (with signing)
│   │   └── __tests__/
│   │       ├── ActionsSwapNamespace.test.ts
│   │       └── WalletSwapNamespace.test.ts
│   └── __mocks__/
│       └── MockSwapProvider.ts
├── types/
│   └── swap/
│       ├── base.ts                       # Core swap types
│       ├── uniswap.ts                    # Uniswap-specific types
│       └── index.ts                      # Re-exports
```

### Pattern Reference

This implementation mirrors the established LendProvider pattern:

| LendProvider | SwapProvider |
|--------------|--------------|
| `LendProvider` abstract class | `SwapProvider` abstract class |
| `MorphoLendProvider`, `AaveLendProvider` | `UniswapSwapProvider` |
| `LendProviderConfig` | `SwapProviderConfig` |
| `ActionsLendNamespace` | `ActionsSwapNamespace` |
| `WalletLendNamespace` | `WalletSwapNamespace` |

---

## Types and Interfaces

### Configuration Types

```typescript
// packages/sdk/src/types/swap/base.ts

import type { Address } from 'viem'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

/**
 * Swap provider configuration
 * @description Configuration for a single swap provider (mirrors LendProviderConfig pattern)
 */
export interface SwapProviderConfig {
  /** Default slippage tolerance (e.g., 0.005 for 0.5%) */
  defaultSlippage?: number
  /** Allowlist of trading pairs (optional - defaults to all supported assets) */
  pairAllowlist?: SwapPairConfig[]
  /** Blocklist of trading pairs to exclude */
  pairBlocklist?: SwapPairConfig[]
}

/**
 * Swap pair configuration - simplified format
 * @description Define a trading pair by assets
 */
export interface SwapPairSimple {
  /** Token pair [assetIn, assetOut] - order doesn't matter for allowlist */
  assets: [Asset, Asset]
  /** Chain ID where this pair is allowed */
  chainId: SupportedChainId
}

/**
 * Swap pair configuration - explicit pool format
 * @description Define a specific pool by its PoolKey (Uniswap V4)
 */
export interface SwapPairExplicit {
  /** Full pool key for explicit pool targeting */
  poolKey: PoolKey
  /** Chain ID where this pool exists */
  chainId: SupportedChainId
}

/**
 * Union type for swap pair configuration
 * @description Supports both simplified asset pairs and explicit pool keys
 */
export type SwapPairConfig = SwapPairSimple | SwapPairExplicit

/**
 * Uniswap V4 PoolKey structure
 * @description Uniquely identifies a Uniswap V4 pool
 */
export interface PoolKey {
  /** Lower-sorted currency address (use zero address for native ETH) */
  currency0: Address
  /** Higher-sorted currency address */
  currency1: Address
  /** Pool fee in pips (500 = 0.05%, 3000 = 0.30%, 10000 = 1%) */
  fee: number
  /** Tick spacing for the pool */
  tickSpacing: number
  /** Hook contract address (zero address for no hooks) */
  hooks: Address
}

/**
 * Type guard to check if config is explicit pool format
 */
export function isExplicitPairConfig(
  config: SwapPairConfig
): config is SwapPairExplicit {
  return 'poolKey' in config
}
```

### ActionsConfig Extension

```typescript
// packages/sdk/src/types/actions.ts (additions)

import type { SwapProviderConfig } from '@/types/swap/index.js'

/**
 * Swap configuration
 * @description Configuration for all swap providers
 */
export interface SwapConfig {
  /** Uniswap swap provider configuration */
  uniswap?: SwapProviderConfig
  // Future providers: 1inch?, 0x?, etc.
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
  swap?: SwapConfig  // NEW
  assets?: AssetsConfig
  chains: ChainConfig[]
}
```

### Swap Operation Types

```typescript
// packages/sdk/src/types/swap/base.ts (continued)

import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

/**
 * Parameters for executing a swap
 * @description At least one of amountIn or amountOut must be provided
 */
export interface SwapExecuteParams {
  /** Amount of input token (human-readable). Mutually exclusive with amountOut for determining swap type. */
  amountIn?: number
  /** Amount of output token (human-readable). If provided without amountIn, executes exact output swap. */
  amountOut?: number
  /** Token to sell */
  assetIn: Asset
  /** Token to buy */
  assetOut: Asset
  /** Slippage tolerance override (e.g., 0.01 for 1%). Overrides provider and config defaults. */
  slippage?: number
  /** Transaction deadline as Unix timestamp. Defaults to now + 20 minutes. */
  deadline?: number
  /** Recipient address. Defaults to wallet address. */
  recipient?: Address
}

/**
 * Internal parameters after validation and conversion
 */
export interface SwapExecuteInternalParams {
  amountInWei?: bigint
  amountOutWei?: bigint
  assetIn: Asset
  assetOut: Asset
  slippage: number
  deadline: number
  recipient: Address
  walletAddress: Address
  chainId: SupportedChainId
}

/**
 * Parameters for getting a swap price quote
 */
export interface SwapPriceParams {
  /** Token to get price for (required) */
  assetIn: Asset
  /** Token to price against. Defaults to USDC if not provided. */
  assetOut?: Asset
  /** Amount of input token. Defaults to 1 unit. */
  amountIn?: number
  /** Amount of output token. For reverse quotes. */
  amountOut?: number
  /** Chain to get price on */
  chainId: SupportedChainId
}

/**
 * Swap route information
 */
export interface SwapRoute {
  /** Ordered list of assets in the route path */
  path: Asset[]
  /** Pool information for each hop */
  pools: SwapPoolInfo[]
}

/**
 * Pool information for a swap hop
 */
export interface SwapPoolInfo {
  /** Pool address or identifier */
  address: Address
  /** Fee tier in pips */
  fee: number
  /** Protocol version used (v2, v3, v4) */
  version: 'v2' | 'v3' | 'v4'
}

/**
 * Swap price quote response
 */
export interface SwapPrice {
  /** Exchange rate as human-readable string (e.g., "3245.50") */
  price: string
  /** Inverse exchange rate */
  priceInverse: string
  /** Input amount in wei */
  amountIn: bigint
  /** Expected output amount in wei */
  amountOut: bigint
  /** Human-readable output amount */
  amountOutFormatted: string
  /** Price impact as decimal (0.01 = 1%) */
  priceImpact: number
  /** Route taken for the swap */
  route: SwapRoute
  /** Estimated gas cost in wei */
  gasEstimate?: bigint
}

/**
 * Transaction data for swap execution
 */
export interface SwapTransactionData {
  /** Permit2 approval transaction (if needed) */
  permit2Approval?: TransactionData
  /** Token approval to Permit2 (if needed) */
  tokenApproval?: TransactionData
  /** Main swap transaction */
  swap: TransactionData
}

/**
 * Swap transaction result
 */
export interface SwapTransaction {
  /** Input amount in wei */
  amountIn: bigint
  /** Output amount in wei (expected) */
  amountOut: bigint
  /** Input asset */
  assetIn: Asset
  /** Output asset */
  assetOut: Asset
  /** Execution price */
  price: string
  /** Price impact */
  priceImpact: number
  /** Transaction data for execution */
  transactionData: SwapTransactionData
}

/**
 * Swap execution receipt
 */
export interface SwapReceipt {
  /** Transaction receipt(s) */
  receipt: TransactionReturnType | BatchTransactionReturnType
  /** Actual input amount in wei */
  amountIn: bigint
  /** Actual output amount in wei */
  amountOut: bigint
  /** Input asset */
  assetIn: Asset
  /** Output asset */
  assetOut: Asset
  /** Execution price as human-readable string */
  price: string
  /** Price impact as decimal */
  priceImpact: number
}
```

### Provider Method Types

```typescript
// packages/sdk/src/types/swap/base.ts (continued)

/**
 * Protected method signatures for SwapProvider implementations
 */
export interface SwapProviderMethods {
  /**
   * Provider implementation of execute method
   */
  _execute(params: SwapExecuteInternalParams): Promise<SwapTransaction>

  /**
   * Provider implementation of price method
   */
  _getPrice(params: SwapPriceParams): Promise<SwapPrice>

  /**
   * Check if provider supports the given chain
   */
  _isChainSupported(chainId: SupportedChainId): boolean
}
```

---

## Core Classes

### SwapProvider Abstract Base Class

```typescript
// packages/sdk/src/swap/core/SwapProvider.ts

import type { Address } from 'viem'
import { parseUnits } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type {
  SwapProviderConfig,
  SwapExecuteParams,
  SwapExecuteInternalParams,
  SwapPriceParams,
  SwapPrice,
  SwapTransaction,
  SwapPairConfig,
} from '@/types/swap/base.js'
import { isExplicitPairConfig } from '@/types/swap/base.js'
import { getAssetAddress, isAssetSupportedOnChain } from '@/utils/assets.js'

/** Default slippage tolerance (0.5%) */
const DEFAULT_SLIPPAGE = 0.005

/** Default deadline offset (20 minutes) */
const DEFAULT_DEADLINE_OFFSET = 20 * 60

/**
 * Abstract base class for swap providers
 * @description Defines the interface for all swap provider implementations.
 * Uses template method pattern - public methods handle validation and conversion,
 * protected abstract methods implement provider-specific logic.
 */
export abstract class SwapProvider<
  TConfig extends SwapProviderConfig = SwapProviderConfig,
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

  /** Default slippage from config or provider default */
  get defaultSlippage(): number {
    return this._config.defaultSlippage ?? DEFAULT_SLIPPAGE
  }

  /**
   * Execute a token swap
   * @param params - Swap parameters
   * @returns Swap transaction data ready for execution
   */
  async execute(params: SwapExecuteParams & {
    walletAddress: Address
    chainId: SupportedChainId
  }): Promise<SwapTransaction> {
    // Validate at least one amount is provided
    if (params.amountIn === undefined && params.amountOut === undefined) {
      throw new Error('Either amountIn or amountOut must be provided')
    }

    // Validate chain support
    this.validateChainSupported(params.chainId)

    // Validate pair is allowed
    this.validatePairAllowed(params.assetIn, params.assetOut, params.chainId)

    // Validate assets are supported on chain
    if (!isAssetSupportedOnChain(params.assetIn, params.chainId)) {
      throw new Error(`Asset ${params.assetIn.metadata.symbol} not supported on chain ${params.chainId}`)
    }
    if (!isAssetSupportedOnChain(params.assetOut, params.chainId)) {
      throw new Error(`Asset ${params.assetOut.metadata.symbol} not supported on chain ${params.chainId}`)
    }

    // Convert amounts to wei
    const amountInWei = params.amountIn !== undefined
      ? parseUnits(params.amountIn.toString(), params.assetIn.metadata.decimals)
      : undefined

    const amountOutWei = params.amountOut !== undefined
      ? parseUnits(params.amountOut.toString(), params.assetOut.metadata.decimals)
      : undefined

    // Build internal params with defaults
    const internalParams: SwapExecuteInternalParams = {
      amountInWei,
      amountOutWei,
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      slippage: params.slippage ?? this.defaultSlippage,
      deadline: params.deadline ?? Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_OFFSET,
      recipient: params.recipient ?? params.walletAddress,
      walletAddress: params.walletAddress,
      chainId: params.chainId,
    }

    return this._execute(internalParams)
  }

  /**
   * Get price quote for a swap
   * @param params - Price query parameters
   * @returns Price quote with route information
   */
  async getPrice(params: SwapPriceParams): Promise<SwapPrice> {
    this.validateChainSupported(params.chainId)
    return this._getPrice(params)
  }

  /**
   * Get supported chain IDs for this provider
   */
  abstract supportedChainIds(): SupportedChainId[]

  /**
   * Check if a chain is supported
   */
  isChainSupported(chainId: SupportedChainId): boolean {
    return this.supportedChainIds().includes(chainId)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Protected abstract methods (implement in provider)
  // ─────────────────────────────────────────────────────────────────────────────

  protected abstract _execute(
    params: SwapExecuteInternalParams
  ): Promise<SwapTransaction>

  protected abstract _getPrice(params: SwapPriceParams): Promise<SwapPrice>

  // ─────────────────────────────────────────────────────────────────────────────
  // Protected validation helpers
  // ─────────────────────────────────────────────────────────────────────────────

  protected validateChainSupported(chainId: SupportedChainId): void {
    if (!this.isChainSupported(chainId)) {
      throw new Error(
        `Chain ${chainId} is not supported by this swap provider. ` +
        `Supported chains: ${this.supportedChainIds().join(', ')}`
      )
    }
  }

  protected validatePairAllowed(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId
  ): void {
    const { pairAllowlist, pairBlocklist } = this._config

    // Check blocklist first
    if (pairBlocklist?.length) {
      const isBlocked = this.isPairInList(assetIn, assetOut, chainId, pairBlocklist)
      if (isBlocked) {
        throw new Error(
          `Pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol} is blocked on chain ${chainId}`
        )
      }
    }

    // Check allowlist if configured
    if (pairAllowlist?.length) {
      const isAllowed = this.isPairInList(assetIn, assetOut, chainId, pairAllowlist)
      if (!isAllowed) {
        throw new Error(
          `Pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol} is not in the allowlist for chain ${chainId}`
        )
      }
    }
  }

  private isPairInList(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
    list: SwapPairConfig[]
  ): boolean {
    return list.some((config) => {
      if (config.chainId !== chainId) return false

      if (isExplicitPairConfig(config)) {
        // For explicit pool config, check currencies match (order matters in PoolKey)
        const inAddress = getAssetAddress(assetIn, chainId).toLowerCase()
        const outAddress = getAssetAddress(assetOut, chainId).toLowerCase()
        const c0 = config.poolKey.currency0.toLowerCase()
        const c1 = config.poolKey.currency1.toLowerCase()
        return (
          (inAddress === c0 && outAddress === c1) ||
          (inAddress === c1 && outAddress === c0)
        )
      }

      // Simple pair config - order doesn't matter
      const [asset0, asset1] = config.assets
      const symbolIn = assetIn.metadata.symbol.toLowerCase()
      const symbolOut = assetOut.metadata.symbol.toLowerCase()
      const s0 = asset0.metadata.symbol.toLowerCase()
      const s1 = asset1.metadata.symbol.toLowerCase()
      return (
        (symbolIn === s0 && symbolOut === s1) ||
        (symbolIn === s1 && symbolOut === s0)
      )
    })
  }
}
```

### UniswapSwapProvider Implementation

```typescript
// packages/sdk/src/swap/providers/uniswap/UniswapSwapProvider.ts

import type { Address, Hex } from 'viem'
import { encodeFunctionData, zeroAddress } from 'viem'

import { SwapProvider } from '@/swap/core/SwapProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  SwapProviderConfig,
  SwapExecuteInternalParams,
  SwapPriceParams,
  SwapPrice,
  SwapTransaction,
  TransactionData,
} from '@/types/swap/base.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

import { getUniswapAddresses, getSupportedChainIds } from './addresses.js'
import {
  getQuote,
  buildSwapTransaction,
  encodeUniversalRouterSwap,
} from './sdk.js'
import {
  checkPermit2Allowance,
  buildPermit2ApprovalTx,
  buildTokenApprovalTx,
} from './permit2.js'

/**
 * Uniswap swap provider using Universal Router
 * @description Routes swaps across V2, V3, and V4 pools automatically for best pricing.
 * Uses Permit2 for token approvals.
 */
export class UniswapSwapProvider extends SwapProvider<SwapProviderConfig> {
  constructor(config: SwapProviderConfig, chainManager: ChainManager) {
    super(config, chainManager)
  }

  supportedChainIds(): SupportedChainId[] {
    return getSupportedChainIds()
  }

  protected async _execute(
    params: SwapExecuteInternalParams
  ): Promise<SwapTransaction> {
    const { chainId, assetIn, assetOut, walletAddress } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    // Get quote first for price info
    const quote = await getQuote({
      ...params,
      publicClient,
      quoterAddress: addresses.quoter,
    })

    // Build the swap calldata
    const swapCalldata = await encodeUniversalRouterSwap({
      ...params,
      quote,
      universalRouterAddress: addresses.universalRouter,
    })

    // Determine if approvals are needed (not for native ETH input)
    let tokenApproval: TransactionData | undefined
    let permit2Approval: TransactionData | undefined

    if (!isNativeAsset(assetIn)) {
      const assetInAddress = getAssetAddress(assetIn, chainId)

      // Check if token is approved to Permit2
      const tokenAllowance = await this.checkTokenAllowance(
        assetInAddress,
        walletAddress,
        addresses.permit2,
        chainId
      )

      if (tokenAllowance < (params.amountInWei ?? quote.amountIn)) {
        tokenApproval = buildTokenApprovalTx(
          assetInAddress,
          addresses.permit2
        )
      }

      // Check Permit2 allowance to Universal Router
      const permit2Allowance = await checkPermit2Allowance({
        publicClient,
        permit2Address: addresses.permit2,
        owner: walletAddress,
        token: assetInAddress,
        spender: addresses.universalRouter,
      })

      if (permit2Allowance.amount < (params.amountInWei ?? quote.amountIn)) {
        permit2Approval = buildPermit2ApprovalTx({
          permit2Address: addresses.permit2,
          token: assetInAddress,
          spender: addresses.universalRouter,
        })
      }
    }

    // Build swap transaction
    const swapTx: TransactionData = {
      to: addresses.universalRouter,
      data: swapCalldata,
      value: isNativeAsset(assetIn) ? (params.amountInWei ?? 0n) : 0n,
    }

    return {
      amountIn: params.amountInWei ?? quote.amountIn,
      amountOut: quote.amountOut,
      assetIn,
      assetOut,
      price: quote.price,
      priceImpact: quote.priceImpact,
      transactionData: {
        tokenApproval,
        permit2Approval,
        swap: swapTx,
      },
    }
  }

  protected async _getPrice(params: SwapPriceParams): Promise<SwapPrice> {
    const { chainId } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    return getQuote({
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      amountInWei: params.amountIn !== undefined
        ? BigInt(Math.floor(params.amountIn * 10 ** params.assetIn.metadata.decimals))
        : BigInt(10 ** params.assetIn.metadata.decimals), // Default to 1 unit
      amountOutWei: params.amountOut !== undefined
        ? BigInt(Math.floor(params.amountOut * 10 ** params.assetOut!.metadata.decimals))
        : undefined,
      chainId,
      publicClient,
      quoterAddress: addresses.quoter,
    })
  }

  private async checkTokenAllowance(
    token: Address,
    owner: Address,
    spender: Address,
    chainId: SupportedChainId
  ): Promise<bigint> {
    const publicClient = this.chainManager.getPublicClient(chainId)
    const allowance = await publicClient.readContract({
      address: token,
      abi: [
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
      ],
      functionName: 'allowance',
      args: [owner, spender],
    })
    return allowance
  }
}
```

### SDK Wrapper

```typescript
// packages/sdk/src/swap/providers/uniswap/sdk.ts

/**
 * Uniswap SDK wrapper
 * @description Wraps @uniswap/v4-sdk, @uniswap/universal-router-sdk, and related packages.
 * Handles quote fetching, route computation, and transaction encoding.
 *
 * Implementation notes:
 * - Use V4Planner for V4 swaps, RoutePlanner for Universal Router encoding
 * - Quoter contract is called via staticCall (reverts to return data)
 * - Auto Router logic handles multi-hop and split routes automatically
 */

import type { PublicClient, Address, Hex } from 'viem'
import { encodeFunctionData, decodeFunctionResult } from 'viem'

import type { Asset } from '@/types/asset.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { SwapPrice, SwapRoute, SwapPoolInfo } from '@/types/swap/base.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'
import { formatUnits } from 'viem'

// Quoter V2 ABI (subset for quoting)
const QUOTER_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
  {
    name: 'quoteExactOutputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

interface GetQuoteParams {
  assetIn: Asset
  assetOut?: Asset
  amountInWei?: bigint
  amountOutWei?: bigint
  chainId: SupportedChainId
  publicClient: PublicClient
  quoterAddress: Address
}

/**
 * Get a swap quote from the Quoter contract
 * @description Uses staticCall to simulate the quote (contract reverts with return data)
 */
export async function getQuote(params: GetQuoteParams): Promise<SwapPrice> {
  const {
    assetIn,
    assetOut,
    amountInWei,
    amountOutWei,
    chainId,
    publicClient,
    quoterAddress,
  } = params

  // Default assetOut to USDC if not provided
  // Note: Implementation should import USDC from constants and use it here
  if (!assetOut) {
    throw new Error('assetOut is required') // TODO: Default to USDC
  }

  const tokenIn = isNativeAsset(assetIn)
    ? getWrappedNativeAddress(chainId)
    : getAssetAddress(assetIn, chainId)

  const tokenOut = isNativeAsset(assetOut)
    ? getWrappedNativeAddress(chainId)
    : getAssetAddress(assetOut, chainId)

  // Determine quote type
  const isExactInput = amountInWei !== undefined
  const fee = 500 // Use lowest fee tier for demo (0.05%)

  let amountIn: bigint
  let amountOut: bigint
  let gasEstimate: bigint

  if (isExactInput) {
    // Quote exact input
    const result = await publicClient.simulateContract({
      address: quoterAddress,
      abi: QUOTER_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{
        tokenIn,
        tokenOut,
        amountIn: amountInWei!,
        fee,
        sqrtPriceLimitX96: 0n,
      }],
    })

    amountIn = amountInWei!
    amountOut = result.result[0]
    gasEstimate = result.result[3]
  } else {
    // Quote exact output
    const result = await publicClient.simulateContract({
      address: quoterAddress,
      abi: QUOTER_ABI,
      functionName: 'quoteExactOutputSingle',
      args: [{
        tokenIn,
        tokenOut,
        amount: amountOutWei!,
        fee,
        sqrtPriceLimitX96: 0n,
      }],
    })

    amountIn = result.result[0]
    amountOut = amountOutWei!
    gasEstimate = result.result[3]
  }

  // Calculate price and price impact
  const price = calculatePrice(amountIn, amountOut, assetIn, assetOut)
  const priceInverse = calculatePrice(amountOut, amountIn, assetOut, assetIn)
  const priceImpact = calculatePriceImpact(amountIn, amountOut, assetIn, assetOut)

  // Build route info
  const route: SwapRoute = {
    path: [assetIn, assetOut],
    pools: [{
      address: tokenIn, // Simplified - would be actual pool address
      fee,
      version: 'v4', // Assuming V4 for demo
    }],
  }

  return {
    price,
    priceInverse,
    amountIn,
    amountOut,
    amountOutFormatted: formatUnits(amountOut, assetOut.metadata.decimals),
    priceImpact,
    route,
    gasEstimate,
  }
}

/**
 * Encode Universal Router swap calldata
 * @description Builds the calldata for executing a swap through Universal Router
 */
export async function encodeUniversalRouterSwap(params: {
  amountInWei?: bigint
  amountOutWei?: bigint
  assetIn: Asset
  assetOut: Asset
  slippage: number
  deadline: number
  recipient: Address
  chainId: SupportedChainId
  quote: SwapPrice
  universalRouterAddress: Address
}): Promise<Hex> {
  // Implementation uses @uniswap/universal-router-sdk
  // This is a placeholder showing the structure

  // For V4 swaps:
  // 1. Create V4Planner
  // 2. Add SWAP_EXACT_IN_SINGLE or SWAP_EXACT_OUT_SINGLE action
  // 3. Add SETTLE and TAKE actions
  // 4. Create RoutePlanner and add V4_SWAP command
  // 5. Encode execute() call

  throw new Error('Not implemented - use @uniswap/universal-router-sdk')
}

// Helper functions

function getWrappedNativeAddress(chainId: SupportedChainId): Address {
  // WETH addresses per chain
  const WETH_ADDRESSES: Record<number, Address> = {
    84532: '0x4200000000000000000000000000000000000006', // Base Sepolia
    // Add other chains as needed
  }
  const address = WETH_ADDRESSES[chainId]
  if (!address) throw new Error(`No WETH address for chain ${chainId}`)
  return address
}

function calculatePrice(
  amountIn: bigint,
  amountOut: bigint,
  assetIn: Asset,
  assetOut: Asset
): string {
  const inDecimals = assetIn.metadata.decimals
  const outDecimals = assetOut.metadata.decimals

  // Normalize to same decimal places for division
  const normalizedIn = Number(amountIn) / 10 ** inDecimals
  const normalizedOut = Number(amountOut) / 10 ** outDecimals

  return (normalizedOut / normalizedIn).toFixed(6)
}

function calculatePriceImpact(
  amountIn: bigint,
  amountOut: bigint,
  assetIn: Asset,
  assetOut: Asset
): number {
  // Simplified price impact calculation
  // Real implementation would compare against mid price from pool
  return 0.001 // Placeholder 0.1%
}
```

### Permit2 Helpers

```typescript
// packages/sdk/src/swap/providers/uniswap/permit2.ts

/**
 * Permit2 approval helpers
 * @description Handles the two-step approval process for Uniswap V4:
 * 1. Approve Permit2 as spender on the ERC20 token
 * 2. Approve Universal Router on Permit2
 */

import type { PublicClient, Address } from 'viem'
import { encodeFunctionData, maxUint256, maxUint160, maxUint48 } from 'viem'

import type { TransactionData } from '@/types/swap/base.js'

// Permit2 ABI (subset)
const PERMIT2_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
] as const

// ERC20 approve ABI
const ERC20_APPROVE_ABI = [
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

interface Permit2Allowance {
  amount: bigint
  expiration: number
  nonce: number
}

/**
 * Check Permit2 allowance for a token/spender pair
 */
export async function checkPermit2Allowance(params: {
  publicClient: PublicClient
  permit2Address: Address
  owner: Address
  token: Address
  spender: Address
}): Promise<Permit2Allowance> {
  const { publicClient, permit2Address, owner, token, spender } = params

  const result = await publicClient.readContract({
    address: permit2Address,
    abi: PERMIT2_ABI,
    functionName: 'allowance',
    args: [owner, token, spender],
  })

  return {
    amount: BigInt(result[0]),
    expiration: Number(result[1]),
    nonce: Number(result[2]),
  }
}

/**
 * Build token approval transaction to Permit2
 */
export function buildTokenApprovalTx(
  token: Address,
  permit2Address: Address
): TransactionData {
  const data = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [permit2Address, maxUint256],
  })

  return {
    to: token,
    data,
    value: 0n,
  }
}

/**
 * Build Permit2 approval transaction for Universal Router
 */
export function buildPermit2ApprovalTx(params: {
  permit2Address: Address
  token: Address
  spender: Address
}): TransactionData {
  const { permit2Address, token, spender } = params

  const data = encodeFunctionData({
    abi: PERMIT2_ABI,
    functionName: 'approve',
    args: [
      token,
      spender,
      maxUint160,  // Max amount
      maxUint48,   // Max expiration (never expires)
    ],
  })

  return {
    to: permit2Address,
    data,
    value: 0n,
  }
}
```

### Contract Addresses

```typescript
// packages/sdk/src/swap/providers/uniswap/addresses.ts

/**
 * Uniswap contract addresses per chain
 * @description Addresses from https://docs.uniswap.org/contracts/v4/deployments
 */

import type { Address } from 'viem'
import { baseSepolia } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'

interface UniswapAddresses {
  poolManager: Address
  positionManager: Address
  universalRouter: Address
  quoter: Address
  permit2: Address
}

const UNISWAP_ADDRESSES: Partial<Record<SupportedChainId, UniswapAddresses>> = {
  // Base Sepolia (84532)
  [baseSepolia.id]: {
    poolManager: '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408',
    positionManager: '0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80',
    universalRouter: '0x492e6456d9528771018deb9e87ef7750ef184104',
    quoter: '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  },
  // Add mainnet addresses as needed
}

/**
 * Get Uniswap contract addresses for a chain
 */
export function getUniswapAddresses(chainId: SupportedChainId): UniswapAddresses {
  const addresses = UNISWAP_ADDRESSES[chainId]
  if (!addresses) {
    throw new Error(`Uniswap not supported on chain ${chainId}`)
  }
  return addresses
}

/**
 * Get supported chain IDs for Uniswap
 */
export function getSupportedChainIds(): SupportedChainId[] {
  return Object.keys(UNISWAP_ADDRESSES).map(Number) as SupportedChainId[]
}
```

---

## Namespace Implementation

### BaseSwapNamespace

```typescript
// packages/sdk/src/swap/namespaces/BaseSwapNamespace.ts

import type { SwapProvider } from '@/swap/core/SwapProvider.js'
import type { SwapProviderConfig } from '@/types/swap/base.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { SwapPriceParams, SwapPrice } from '@/types/swap/base.js'

export type SwapProviders = {
  uniswap?: SwapProvider<SwapProviderConfig>
  // Future: oneInch?, zeroX?, etc.
}

/**
 * Base swap namespace with shared read-only operations
 */
export abstract class BaseSwapNamespace {
  constructor(protected readonly providers: SwapProviders) {}

  /**
   * Get price quote for a swap
   */
  async price(params: SwapPriceParams): Promise<SwapPrice> {
    const provider = this.getProviderForChain(params.chainId)
    return provider.getPrice(params)
  }

  /**
   * Get all supported chain IDs across all providers
   */
  supportedChainIds(): SupportedChainId[] {
    const chainIds = new Set<SupportedChainId>()
    for (const provider of this.getAllProviders()) {
      for (const chainId of provider.supportedChainIds()) {
        chainIds.add(chainId)
      }
    }
    return Array.from(chainIds)
  }

  protected getAllProviders(): SwapProvider<SwapProviderConfig>[] {
    return Object.values(this.providers).filter(
      (p): p is SwapProvider<SwapProviderConfig> => p !== undefined
    )
  }

  protected getProviderForChain(
    chainId: SupportedChainId
  ): SwapProvider<SwapProviderConfig> {
    for (const provider of this.getAllProviders()) {
      if (provider.isChainSupported(chainId)) {
        return provider
      }
    }
    throw new Error(`No swap provider available for chain ${chainId}`)
  }
}
```

### ActionsSwapNamespace

```typescript
// packages/sdk/src/swap/namespaces/ActionsSwapNamespace.ts

import { BaseSwapNamespace } from './BaseSwapNamespace.js'

/**
 * Actions swap namespace (read-only, no wallet required)
 * @description Provides price() for getting quotes without a wallet
 */
export class ActionsSwapNamespace extends BaseSwapNamespace {
  // Inherits price() and supportedChainIds() from BaseSwapNamespace
  // No additional methods needed for read-only access
}
```

### WalletSwapNamespace

```typescript
// packages/sdk/src/swap/namespaces/WalletSwapNamespace.ts

import type { Address } from 'viem'

import { BaseSwapNamespace, type SwapProviders } from './BaseSwapNamespace.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  SwapExecuteParams,
  SwapReceipt,
  SwapTransaction,
} from '@/types/swap/base.js'

/**
 * Wallet swap namespace (full operations with signing)
 * @description Provides execute() for swapping tokens
 */
export class WalletSwapNamespace extends BaseSwapNamespace {
  constructor(
    providers: SwapProviders,
    private readonly wallet: Wallet
  ) {
    super(providers)
  }

  /**
   * Execute a token swap
   * @param params - Swap parameters
   * @param chainId - Chain to execute on
   * @returns Swap receipt with transaction details
   */
  async execute(
    params: SwapExecuteParams,
    chainId: SupportedChainId
  ): Promise<SwapReceipt> {
    const provider = this.getProviderForChain(chainId)

    // Build swap transaction
    const swapTx = await provider.execute({
      ...params,
      walletAddress: this.wallet.address,
      chainId,
    })

    // Execute transaction(s)
    const receipt = await this.executeTransaction(swapTx, chainId)

    return {
      receipt,
      amountIn: swapTx.amountIn,
      amountOut: swapTx.amountOut,
      assetIn: swapTx.assetIn,
      assetOut: swapTx.assetOut,
      price: swapTx.price,
      priceImpact: swapTx.priceImpact,
    }
  }

  /**
   * Execute swap transaction with approval batching
   */
  private async executeTransaction(
    swapTx: SwapTransaction,
    chainId: SupportedChainId
  ): Promise<SwapReceipt['receipt']> {
    const { transactionData } = swapTx
    const txs = []

    // Add token approval if needed
    if (transactionData.tokenApproval) {
      txs.push(transactionData.tokenApproval)
    }

    // Add Permit2 approval if needed
    if (transactionData.permit2Approval) {
      txs.push(transactionData.permit2Approval)
    }

    // Add main swap transaction
    txs.push(transactionData.swap)

    // Execute as batch if multiple transactions, otherwise single
    if (txs.length > 1) {
      return this.wallet.sendBatch(txs, chainId)
    }
    return this.wallet.send(transactionData.swap, chainId)
  }
}
```

---

## Actions Class Integration

```typescript
// packages/sdk/src/actions.ts (additions)

import type { SwapConfig } from '@/types/actions.js'
import { UniswapSwapProvider } from '@/swap/providers/uniswap/UniswapSwapProvider.js'
import { ActionsSwapNamespace } from '@/swap/namespaces/ActionsSwapNamespace.js'
import type { SwapProviders } from '@/swap/namespaces/BaseSwapNamespace.js'

export class Actions {
  // ... existing code ...

  private _swapProviders: SwapProviders = {}
  private _swap?: ActionsSwapNamespace

  constructor(config: ActionsConfig, deps: { hostedWalletProviderRegistry }) {
    // ... existing initialization ...

    // Initialize swap providers
    if (config.swap?.uniswap) {
      this._swapProviders.uniswap = new UniswapSwapProvider(
        config.swap.uniswap,
        this.chainManager
      )
    }

    // Create swap namespace if any providers configured
    if (Object.keys(this._swapProviders).length > 0) {
      this._swap = new ActionsSwapNamespace(this._swapProviders)
    }

    // ... pass to wallet provider ...
  }

  /**
   * Swap namespace for price quotes (read-only)
   */
  get swap(): ActionsSwapNamespace | undefined {
    return this._swap
  }

  // Expose swap providers for wallet creation
  get swapProviders(): SwapProviders {
    return this._swapProviders
  }
}
```

---

## Wallet Class Integration

```typescript
// packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts (additions)

import { WalletSwapNamespace } from '@/swap/namespaces/WalletSwapNamespace.js'
import type { SwapProviders } from '@/swap/namespaces/BaseSwapNamespace.js'

export abstract class Wallet {
  // ... existing code ...

  private _swap?: WalletSwapNamespace

  protected initializeSwap(providers: SwapProviders): void {
    if (Object.keys(providers).length > 0) {
      this._swap = new WalletSwapNamespace(providers, this)
    }
  }

  /**
   * Swap namespace for executing swaps
   */
  get swap(): WalletSwapNamespace | undefined {
    return this._swap
  }
}
```

---

## Demo Script: Uniswap Pool Deployment

### Shared State File

```typescript
// packages/demo/contracts/state/demo-state.json
{
  "baseSepolia": {
    "tokens": {
      "demoUSDC": null,
      "demoOP": null
    },
    "morpho": {
      "vault": null,
      "oracle": null,
      "marketId": null
    },
    "uniswap": {
      "poolId": null,
      "positionId": null
    },
    "deployedAt": null,
    "deployer": null
  }
}
```

### Deploy Uniswap Pool Script

```solidity
// packages/demo/contracts/script/DeployUniswapPool.s.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

// Uniswap V4 interfaces
interface IPoolManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
}

interface IPositionManager {
    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);
}

interface IPoolInitializer {
    function initializePool(
        IPoolManager.PoolKey memory key,
        uint160 sqrtPriceX96
    ) external returns (int24);
}

interface IAllowanceTransfer {
    function approve(
        address token,
        address spender,
        uint160 amount,
        uint48 expiration
    ) external;
}

/// @title DeployUniswapPool
/// @notice Deploys a Uniswap V4 pool with initial liquidity for demo tokens.
///         Reads token addresses from state file, writes pool info back.
/// @dev Run after DeployMorphoMarket.s.sol to use existing demo tokens
contract DeployUniswapPool is Script {
    // Base Sepolia Uniswap V4 addresses
    address constant POOL_MANAGER = 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408;
    address constant POSITION_MANAGER = 0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // Pool parameters
    uint24 constant FEE = 500; // 0.05% (lowest fee tier)
    int24 constant TICK_SPACING = 10;
    address constant HOOKS = address(0); // No hooks

    // 1:1 price (sqrtPriceX96 for price = 1)
    // Adjusted for decimal difference: USDC (6) vs OP (18)
    // sqrtPrice = sqrt(10^18 / 10^6) * 2^96 = sqrt(10^12) * 2^96
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336000000;

    // Initial liquidity amounts
    uint256 constant USDC_AMOUNT = 100_000e6;  // 100k USDC
    uint256 constant OP_AMOUNT = 100_000e18;   // 100k OP

    // Token addresses (set via environment or read from state file)
    address public demoUSDC;
    address public demoOP;

    function setUp() public {
        // Read from environment variables (set by CI or manually)
        demoUSDC = vm.envAddress("DEMO_USDC_ADDRESS");
        demoOP = vm.envAddress("DEMO_OP_ADDRESS");

        require(demoUSDC != address(0), "DEMO_USDC_ADDRESS not set");
        require(demoOP != address(0), "DEMO_OP_ADDRESS not set");
    }

    function run() public {
        vm.startBroadcast();

        // Sort currencies (required by Uniswap V4)
        (address currency0, address currency1) = sortTokens(demoUSDC, demoOP);

        console.log("Currency0:", currency0);
        console.log("Currency1:", currency1);

        // Create pool key
        IPoolManager.PoolKey memory poolKey = IPoolManager.PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: HOOKS
        });

        // Initialize pool
        int24 tick = IPoolManager(POOL_MANAGER).initialize(poolKey, SQRT_PRICE_1_1);
        console.log("Pool initialized at tick:", tick);

        // Mint tokens for liquidity
        mintDemoTokens();

        // Approve Permit2
        IERC20(demoUSDC).approve(PERMIT2, type(uint256).max);
        IERC20(demoOP).approve(PERMIT2, type(uint256).max);

        // Approve PositionManager via Permit2
        IAllowanceTransfer(PERMIT2).approve(
            demoUSDC,
            POSITION_MANAGER,
            type(uint160).max,
            type(uint48).max
        );
        IAllowanceTransfer(PERMIT2).approve(
            demoOP,
            POSITION_MANAGER,
            type(uint160).max,
            type(uint48).max
        );

        // Add liquidity via PositionManager multicall
        // Note: This is simplified - full implementation would encode
        // MINT_POSITION and SETTLE_PAIR actions properly
        addLiquidity(poolKey);

        vm.stopBroadcast();

        // Log pool ID for state file update
        bytes32 poolId = keccak256(abi.encode(poolKey));
        console.log("Pool ID:");
        console.logBytes32(poolId);
    }

    function sortTokens(address tokenA, address tokenB)
        internal
        pure
        returns (address token0, address token1)
    {
        require(tokenA != tokenB, "Identical addresses");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "Zero address");
    }

    function mintDemoTokens() internal {
        // DemoUSDC and DemoOP have public mint functions
        (bool success,) = demoUSDC.call(
            abi.encodeWithSignature("mint(address,uint256)", msg.sender, USDC_AMOUNT)
        );
        require(success, "USDC mint failed");

        (success,) = demoOP.call(
            abi.encodeWithSignature("mint(address,uint256)", msg.sender, OP_AMOUNT)
        );
        require(success, "OP mint failed");
    }

    function addLiquidity(IPoolManager.PoolKey memory poolKey) internal {
        // Encode multicall for:
        // 1. modifyLiquidities with MINT_POSITION action
        //
        // This is a placeholder - actual implementation requires:
        // - Encoding Actions.MINT_POSITION with position params
        // - Encoding Actions.SETTLE_PAIR
        // - Wrapping in modifyLiquidities call
        //
        // See: https://docs.uniswap.org/sdk/v4/guides/liquidity/position-minting

        // For demo purposes, the pool is initialized and tokens are approved
        // Manual liquidity addition can be done via the Uniswap interface
        console.log("Pool ready for liquidity. Add via Uniswap interface or extend this script.");
    }
}
```

### README Updates

```markdown
// packages/demo/contracts/README.md (additions)

### DeployUniswapPool.s.sol

Forge deployment script that creates a Uniswap V4 pool for demo tokens.

**Prerequisites:**
- Demo tokens must be deployed first (run DeployMorphoMarket.s.sol)
- Set environment variables with token addresses

**What it creates:**
- Uniswap V4 pool with DemoUSDC/DemoOP pair
- 0.05% fee tier (lowest)
- Initial liquidity position (100k each token)

**Deploy to Base Sepolia:**

```bash
# Set token addresses from previous deployment
export DEMO_USDC_ADDRESS=0x...
export DEMO_OP_ADDRESS=0x...

forge script script/DeployUniswapPool.s.sol:DeployUniswapPool \
  --rpc-url https://sepolia.base.org \
  --broadcast \
  --private-key <your_private_key>
```

**Post-Deployment:**
Update state file with pool ID for SDK configuration.
```

---

## Demo Backend Integration

### Swap Service

```typescript
// packages/demo/backend/src/services/swap.ts

import type { SmartWallet } from '@eth-optimism/actions-sdk'
import type {
  SwapExecuteParams,
  SwapReceipt,
  SwapPrice,
  SwapPriceParams,
} from '@eth-optimism/actions-sdk'

import { actions } from '@/config/actions.js'
import { getWallet } from '@/services/wallet.js'
import { SUPPORTED_CHAIN_ID } from '@/config/chains.js'
import { getBlockExplorerUrl } from '@/utils/explorer.js'

/**
 * Execute a token swap
 */
export async function executeSwap(
  idToken: string,
  params: SwapExecuteParams
): Promise<SwapReceipt & { explorerUrl?: string }> {
  const wallet = await getWallet(idToken)

  if (!wallet.swap) {
    throw new Error('Swap not configured for this wallet')
  }

  const receipt = await wallet.swap.execute(params, SUPPORTED_CHAIN_ID)

  // Add explorer URL
  const txHash = 'userOpHash' in receipt.receipt
    ? receipt.receipt.receipt.transactionHash
    : receipt.receipt.transactionHash

  return {
    ...receipt,
    explorerUrl: getBlockExplorerUrl(txHash, SUPPORTED_CHAIN_ID),
  }
}

/**
 * Get swap price quote
 */
export async function getSwapPrice(
  params: Omit<SwapPriceParams, 'chainId'>
): Promise<SwapPrice> {
  if (!actions.swap) {
    throw new Error('Swap not configured')
  }

  return actions.swap.price({
    ...params,
    chainId: SUPPORTED_CHAIN_ID,
  })
}
```

### Swap Controller

```typescript
// packages/demo/backend/src/controllers/swap.ts

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

import { executeSwap, getSwapPrice } from '@/services/swap.js'
import { authMiddleware } from '@/middleware/auth.js'
import { SUPPORTED_TOKENS } from '@/config/assets.js'

const swapRouter = new Hono()

// Schema for swap execution
const executeSwapSchema = z.object({
  amountIn: z.number().optional(),
  amountOut: z.number().optional(),
  assetInSymbol: z.string(),
  assetOutSymbol: z.string(),
  slippage: z.number().optional(),
}).refine(
  (data) => data.amountIn !== undefined || data.amountOut !== undefined,
  { message: 'Either amountIn or amountOut must be provided' }
)

// Schema for price quote
const priceSchema = z.object({
  assetInSymbol: z.string(),
  assetOutSymbol: z.string().optional(),
  amountIn: z.number().optional(),
  amountOut: z.number().optional(),
})

// Execute swap
swapRouter.post(
  '/execute',
  authMiddleware,
  zValidator('json', executeSwapSchema),
  async (c) => {
    const idToken = c.get('idToken')
    const body = c.req.valid('json')

    const assetIn = SUPPORTED_TOKENS.find(
      (t) => t.metadata.symbol === body.assetInSymbol
    )
    const assetOut = SUPPORTED_TOKENS.find(
      (t) => t.metadata.symbol === body.assetOutSymbol
    )

    if (!assetIn || !assetOut) {
      return c.json({ error: 'Invalid asset symbol' }, 400)
    }

    const receipt = await executeSwap(idToken, {
      amountIn: body.amountIn,
      amountOut: body.amountOut,
      assetIn,
      assetOut,
      slippage: body.slippage,
    })

    // Serialize BigInt values
    return c.json({
      ...receipt,
      amountIn: receipt.amountIn.toString(),
      amountOut: receipt.amountOut.toString(),
    })
  }
)

// Get price quote
swapRouter.get(
  '/price',
  zValidator('query', priceSchema),
  async (c) => {
    const query = c.req.valid('query')

    const assetIn = SUPPORTED_TOKENS.find(
      (t) => t.metadata.symbol === query.assetInSymbol
    )
    const assetOut = query.assetOutSymbol
      ? SUPPORTED_TOKENS.find((t) => t.metadata.symbol === query.assetOutSymbol)
      : undefined

    if (!assetIn) {
      return c.json({ error: 'Invalid assetIn symbol' }, 400)
    }

    const price = await getSwapPrice({
      assetIn,
      assetOut,
      amountIn: query.amountIn,
      amountOut: query.amountOut,
    })

    // Serialize BigInt values
    return c.json({
      ...price,
      amountIn: price.amountIn.toString(),
      amountOut: price.amountOut.toString(),
      gasEstimate: price.gasEstimate?.toString(),
    })
  }
)

export { swapRouter }
```

### Backend Config Updates

```typescript
// packages/demo/backend/src/config/actions.ts (additions)

import { USDC_DEMO, OP_DEMO } from './assets.js'

export const actions = createActions({
  // ... existing config ...

  swap: {
    uniswap: {
      defaultSlippage: 0.005, // 0.5%
      pairAllowlist: [
        {
          assets: [USDC_DEMO, OP_DEMO],
          chainId: baseSepolia.id,
        },
      ],
    },
  },
})
```

---

## Demo Frontend Integration

### Home Page Updates

Update the home page to reflect swap functionality:

1. **Remove "Coming Soon" placeholder image**
   - Locate and remove the "Coming Soon" image/banner on the home page
   - This placeholder indicates future features that are now being implemented

2. **Update code slider/carousel examples**
   - Update sample code snippets to include swap examples
   - Add a swap code example alongside existing lend examples:
   ```typescript
   // Swap example for slider
   const receipt = await wallet.swap.execute({
     amountIn: 100,
     assetIn: USDC,
     assetOut: ETH,
   }, chainId)
   ```

3. **Update feature descriptions**
   - Ensure swap is listed as an available action
   - Update any "coming soon" text that references swap functionality

### Action Tabs Component

```typescript
// packages/demo/frontend/src/components/ActionTabs.tsx

import { useState } from 'react'

type ActionType = 'lend' | 'borrow' | 'swap' | 'pay'

interface ActionTabsProps {
  activeTab: ActionType
  onTabChange: (tab: ActionType) => void
}

const TABS: { id: ActionType; label: string; enabled: boolean }[] = [
  { id: 'lend', label: 'Lend', enabled: true },
  { id: 'borrow', label: 'Borrow', enabled: false },
  { id: 'swap', label: 'Swap', enabled: true },
  { id: 'pay', label: 'Pay', enabled: false },
]

export function ActionTabs({ activeTab, onTabChange }: ActionTabsProps) {
  return (
    <div className="flex gap-2 mb-4">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => tab.enabled && onTabChange(tab.id)}
          disabled={!tab.enabled}
          className={`
            px-4 py-2 rounded-md font-mono text-sm transition-colors
            ${activeTab === tab.id
              ? 'bg-green-500 text-black'
              : tab.enabled
                ? 'bg-gray-800 text-green-400 hover:bg-gray-700'
                : 'bg-gray-900 text-gray-600 cursor-not-allowed'
            }
          `}
          title={!tab.enabled ? 'Coming Soon' : undefined}
        >
          {tab.label}
          {!tab.enabled && <span className="ml-1 text-xs">(Soon)</span>}
        </button>
      ))}
    </div>
  )
}
```

### Swap Form Component

```typescript
// packages/demo/frontend/src/components/SwapForm.tsx

import { useState, useEffect } from 'react'
import { useSwapPrice, useSwapExecute } from '@/hooks/useSwap'
import { SUPPORTED_TOKENS } from '@/config/assets'

export function SwapForm() {
  const [assetIn, setAssetIn] = useState(SUPPORTED_TOKENS[0])
  const [assetOut, setAssetOut] = useState(SUPPORTED_TOKENS[1])
  const [amountIn, setAmountIn] = useState<string>('')
  const [showPreview, setShowPreview] = useState(false)

  // Get price quote
  const { data: priceQuote, isLoading: isPriceLoading } = useSwapPrice({
    assetIn,
    assetOut,
    amountIn: amountIn ? parseFloat(amountIn) : undefined,
    enabled: !!amountIn && parseFloat(amountIn) > 0,
  })

  // Execute swap mutation
  const { mutate: executeSwap, isPending: isSwapping } = useSwapExecute()

  const handleSwap = () => {
    if (!amountIn || !priceQuote) return

    executeSwap({
      amountIn: parseFloat(amountIn),
      assetInSymbol: assetIn.metadata.symbol,
      assetOutSymbol: assetOut.metadata.symbol,
    })
  }

  const handleFlipAssets = () => {
    const temp = assetIn
    setAssetIn(assetOut)
    setAssetOut(temp)
    setAmountIn('')
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4 font-mono">
      {/* Input token */}
      <div className="mb-4">
        <label className="text-green-400 text-sm">You pay</label>
        <div className="flex gap-2 mt-1">
          <input
            type="number"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder="0.0"
            className="flex-1 bg-gray-800 text-white p-2 rounded border border-gray-700"
          />
          <select
            value={assetIn.metadata.symbol}
            onChange={(e) => {
              const token = SUPPORTED_TOKENS.find(t => t.metadata.symbol === e.target.value)
              if (token) setAssetIn(token)
            }}
            className="bg-gray-800 text-white p-2 rounded border border-gray-700"
          >
            {SUPPORTED_TOKENS.map((token) => (
              <option key={token.metadata.symbol} value={token.metadata.symbol}>
                {token.metadata.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Flip button */}
      <div className="flex justify-center my-2">
        <button
          onClick={handleFlipAssets}
          className="p-2 rounded-full bg-gray-800 hover:bg-gray-700"
        >
          ⇅
        </button>
      </div>

      {/* Output token */}
      <div className="mb-4">
        <label className="text-green-400 text-sm">You receive</label>
        <div className="flex gap-2 mt-1">
          <input
            type="text"
            value={priceQuote?.amountOutFormatted ?? ''}
            readOnly
            placeholder="0.0"
            className="flex-1 bg-gray-800 text-white p-2 rounded border border-gray-700"
          />
          <select
            value={assetOut.metadata.symbol}
            onChange={(e) => {
              const token = SUPPORTED_TOKENS.find(t => t.metadata.symbol === e.target.value)
              if (token) setAssetOut(token)
            }}
            className="bg-gray-800 text-white p-2 rounded border border-gray-700"
          >
            {SUPPORTED_TOKENS.map((token) => (
              <option key={token.metadata.symbol} value={token.metadata.symbol}>
                {token.metadata.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Price preview */}
      {priceQuote && (
        <div className="bg-gray-800 rounded p-3 mb-4 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>Rate</span>
            <span className="text-white">
              1 {assetIn.metadata.symbol} = {priceQuote.price} {assetOut.metadata.symbol}
            </span>
          </div>
          <div className="flex justify-between text-gray-400 mt-1">
            <span>Price Impact</span>
            <span className={priceQuote.priceImpact > 0.01 ? 'text-yellow-400' : 'text-white'}>
              {(priceQuote.priceImpact * 100).toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between text-gray-400 mt-1">
            <span>Route</span>
            <span className="text-white">
              {priceQuote.route.path.map(a => a.metadata.symbol).join(' → ')}
            </span>
          </div>
        </div>
      )}

      {/* Swap button */}
      <button
        onClick={handleSwap}
        disabled={!amountIn || !priceQuote || isSwapping}
        className={`
          w-full py-3 rounded font-bold transition-colors
          ${!amountIn || !priceQuote || isSwapping
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-green-500 text-black hover:bg-green-400'
          }
        `}
      >
        {isSwapping ? 'Swapping...' : isPriceLoading ? 'Loading...' : 'Swap'}
      </button>
    </div>
  )
}
```

### Swap Hooks

```typescript
// packages/demo/frontend/src/hooks/useSwap.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { actionsApi } from '@/api/actionsApi'
import type { Asset } from '@eth-optimism/actions-sdk'

interface UseSwapPriceParams {
  assetIn: Asset
  assetOut: Asset
  amountIn?: number
  amountOut?: number
  enabled?: boolean
}

export function useSwapPrice(params: UseSwapPriceParams) {
  return useQuery({
    queryKey: ['swapPrice', params.assetIn.metadata.symbol, params.assetOut.metadata.symbol, params.amountIn],
    queryFn: () => actionsApi.getSwapPrice({
      assetInSymbol: params.assetIn.metadata.symbol,
      assetOutSymbol: params.assetOut.metadata.symbol,
      amountIn: params.amountIn,
      amountOut: params.amountOut,
    }),
    enabled: params.enabled ?? true,
    staleTime: 10_000, // Refetch every 10s for fresh prices
  })
}

interface SwapExecuteParams {
  amountIn?: number
  amountOut?: number
  assetInSymbol: string
  assetOutSymbol: string
  slippage?: number
}

export function useSwapExecute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: SwapExecuteParams) => actionsApi.executeSwap(params),
    onSuccess: () => {
      // Invalidate balance queries after successful swap
      queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
    },
  })
}
```

### API Client Updates

```typescript
// packages/demo/frontend/src/api/actionsApi.ts (additions)

export const actionsApi = {
  // ... existing methods ...

  async getSwapPrice(params: {
    assetInSymbol: string
    assetOutSymbol?: string
    amountIn?: number
    amountOut?: number
  }) {
    const searchParams = new URLSearchParams()
    searchParams.set('assetInSymbol', params.assetInSymbol)
    if (params.assetOutSymbol) searchParams.set('assetOutSymbol', params.assetOutSymbol)
    if (params.amountIn) searchParams.set('amountIn', params.amountIn.toString())
    if (params.amountOut) searchParams.set('amountOut', params.amountOut.toString())

    const response = await fetch(`${API_BASE}/swap/price?${searchParams}`)
    return response.json()
  },

  async executeSwap(params: {
    amountIn?: number
    amountOut?: number
    assetInSymbol: string
    assetOutSymbol: string
    slippage?: number
  }) {
    const response = await fetch(`${API_BASE}/swap/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getIdToken()}`,
      },
      body: JSON.stringify(params),
    })
    return response.json()
  },
}
```

---

## Testing Requirements

### SDK Tests (Highest Priority)

#### SwapProvider Base Class Tests

```typescript
// packages/sdk/src/swap/core/__tests__/SwapProvider.test.ts

describe('SwapProvider', () => {
  describe('execute()', () => {
    it('should throw if neither amountIn nor amountOut provided')
    it('should throw if chain not supported')
    it('should throw if pair is blocklisted')
    it('should throw if pair not in allowlist (when configured)')
    it('should convert human-readable amounts to wei')
    it('should use default slippage when not specified')
    it('should use config slippage over provider default')
    it('should use param slippage over config default')
    it('should use default deadline when not specified')
    it('should call _execute with correct internal params')
  })

  describe('getPrice()', () => {
    it('should throw if chain not supported')
    it('should call _getPrice with params')
  })

  describe('validatePairAllowed()', () => {
    it('should allow any pair when no allowlist configured')
    it('should allow pairs in allowlist')
    it('should reject pairs not in allowlist')
    it('should reject blocklisted pairs')
    it('should handle explicit pool config format')
    it('should match pairs regardless of order')
  })
})
```

#### UniswapSwapProvider Tests

```typescript
// packages/sdk/src/swap/providers/uniswap/__tests__/UniswapSwapProvider.test.ts

describe('UniswapSwapProvider', () => {
  describe('_execute()', () => {
    it('should build correct swap transaction for exact input')
    it('should build correct swap transaction for exact output')
    it('should include token approval when needed')
    it('should include Permit2 approval when needed')
    it('should skip approvals for native ETH input')
    it('should batch multiple approval transactions')
    it('should use correct Universal Router address for chain')
  })

  describe('_getPrice()', () => {
    it('should return correct quote for exact input')
    it('should return correct quote for exact output')
    it('should calculate price impact')
    it('should include route information')
    it('should handle WETH for native ETH')
  })

  describe('supportedChainIds()', () => {
    it('should return chains with Uniswap V4 deployed')
  })
})
```

#### Namespace Tests

```typescript
// packages/sdk/src/swap/namespaces/__tests__/WalletSwapNamespace.test.ts

describe('WalletSwapNamespace', () => {
  describe('execute()', () => {
    it('should route to correct provider for chain')
    it('should pass wallet address to provider')
    it('should call wallet.send() for single transaction')
    it('should call wallet.sendBatch() for multiple transactions')
    it('should return receipt with execution details')
  })

  describe('price()', () => {
    it('should return price quote from provider')
  })
})
```

### Backend Tests (Medium Priority)

```typescript
// packages/demo/backend/src/services/__tests__/swap.test.ts

describe('SwapService', () => {
  describe('executeSwap()', () => {
    it('should execute swap for authenticated user')
    it('should return explorer URL in receipt')
    it('should throw if swap not configured')
  })

  describe('getSwapPrice()', () => {
    it('should return price quote')
    it('should use supported chain ID')
  })
})
```

### Frontend Tests (Minimal Priority)

```typescript
// packages/demo/frontend/src/components/__tests__/SwapForm.test.tsx

describe('SwapForm', () => {
  it('should render input fields')
  it('should fetch price quote on amount change')
  it('should display price preview')
  it('should execute swap on button click')
  it('should disable button when loading')
})
```

---

## Acceptance Criteria

### SDK

- [ ] `SwapProvider` abstract class implemented with validation logic
- [ ] `UniswapSwapProvider` implemented with Universal Router integration
- [ ] Permit2 approval flow working correctly
- [ ] `ActionsSwapNamespace` provides `price()` method
- [ ] `WalletSwapNamespace` provides `execute()` and `price()` methods
- [ ] Transaction batching works for approval + swap
- [ ] Both exact input and exact output swaps work
- [ ] Slippage cascade (provider → config → param) works correctly
- [ ] Pair allowlist/blocklist validation works
- [ ] All SDK tests passing

### Demo Script

- [ ] `DeployUniswapPool.s.sol` creates V4 pool on Base Sepolia
- [ ] Script reads token addresses from environment
- [ ] Pool initialized with correct fee tier (0.05%)
- [ ] Initial liquidity added to pool
- [ ] State file pattern documented

### Backend

- [ ] `/swap/execute` endpoint executes swaps
- [ ] `/swap/price` endpoint returns quotes
- [ ] Authentication required for execute
- [ ] Swap config added to actions initialization
- [ ] Explorer URLs included in receipts

### Frontend

- [ ] Action tabs component with Lend, Borrow, Swap, Pay
- [ ] Borrow and Pay tabs show "Coming Soon"
- [ ] Swap form with input/output token selection
- [ ] Price preview before execution
- [ ] Token flip button
- [ ] Loading states during quote/swap
- [ ] Success/error feedback

---

## Implementation Notes

### Code Style

Follow existing SDK patterns:
- TypeDoc comments on all public classes, methods, and types
- Minimal inline comments (only for complex logic)
- Use `@/` path aliases for imports
- Export types from `index.ts` files
- Keep functions small and single-purpose

### Dependencies

New packages to add:
```json
{
  "@uniswap/v4-sdk": "^1.x",
  "@uniswap/sdk-core": "^6.x",
  "@uniswap/universal-router-sdk": "^3.x"
}
```

### Error Handling

- Validate inputs early with descriptive error messages
- Wrap SDK errors with context
- Use typed errors where appropriate
- Log errors in services, return clean messages to API

### Future Considerations

- Cross-chain swaps (bridge integration)
- Additional DEX providers (1inch, 0x)
- Limit orders
- MEV protection
- Token tax handling

---

## References

- [Uniswap V4 SDK Documentation](https://docs.uniswap.org/sdk/v4/overview)
- [Uniswap V4 Deployments](https://docs.uniswap.org/contracts/v4/deployments)
- [Universal Router Overview](https://docs.uniswap.org/contracts/universal-router/overview)
- [Permit2 Documentation](https://docs.uniswap.org/contracts/permit2/overview)
- [V4Planner Reference](https://docs.uniswap.org/sdk/v4/reference/classes/V4Planner)
