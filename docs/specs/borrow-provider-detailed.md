# BorrowProvider Feature Specification

## Overview

This specification defines the BorrowProvider abstraction for collateralized borrowing functionality in the Actions SDK. The initial implementation targets Aave V3, the most widely deployed lending/borrowing protocol across Superchain networks.

### Goals

- Enable collateralized borrowing through a clean, minimal API
- Follow established patterns from LendProvider and SwapProvider for consistency
- Support both variable and stable interest rate modes
- Provide health factor monitoring and safety guardrails
- Handle token approvals transparently for repayments
- Integrate with existing LendProvider for collateral supply workflows
- Integrate with the demo application (frontend tabs, backend endpoints)

---

## Architecture

### Directory Structure

```
packages/sdk/src/
├── borrow/
│   ├── core/
│   │   ├── BorrowProvider.ts           # Abstract base class
│   │   └── __tests__/
│   │       └── BorrowProvider.test.ts
│   ├── providers/
│   │   └── aave/
│   │       ├── AaveBorrowProvider.ts      # Aave V3 implementation
│   │       ├── sdk.ts                     # Aave SDK wrapper (Pool, Oracle)
│   │       ├── addresses.ts               # Contract addresses per chain
│   │       └── __tests__/
│   │           └── AaveBorrowProvider.test.ts
│   ├── namespaces/
│   │   ├── BaseBorrowNamespace.ts          # Shared read-only operations
│   │   ├── ActionsBorrowNamespace.ts       # actions.borrow (no wallet)
│   │   ├── WalletBorrowNamespace.ts        # wallet.borrow (with signing)
│   │   └── __tests__/
│   │       ├── ActionsBorrowNamespace.test.ts
│   │       └── WalletBorrowNamespace.test.ts
│   └── __mocks__/
│       └── MockBorrowProvider.ts
├── types/
│   └── borrow/
│       ├── base.ts                       # Core borrow types
│       ├── aave.ts                       # Aave-specific types
│       └── index.ts                      # Re-exports
```

### Pattern Reference

This implementation mirrors the established provider pattern:

| LendProvider | SwapProvider | BorrowProvider |
|--------------|--------------|----------------|
| `LendProvider` abstract class | `SwapProvider` abstract class | `BorrowProvider` abstract class |
| `MorphoLendProvider`, `AaveLendProvider` | `UniswapSwapProvider` | `AaveBorrowProvider` |
| `LendProviderConfig` | `SwapProviderConfig` | `BorrowProviderConfig` |
| `ActionsLendNamespace` | `ActionsSwapNamespace` | `ActionsBorrowNamespace` |
| `WalletLendNamespace` | `WalletSwapNamespace` | `WalletBorrowNamespace` |

### Multi-Provider Aggregation

The BorrowProvider system supports multiple providers simultaneously. When multiple providers are configured (e.g., Aave + Compound), the namespaces aggregate results:

| Method | Behavior |
|--------|----------|
| `getMarkets({ asset })` | Returns markets from ALL providers for the asset |
| `rates(params)` | Returns borrow rates from ALL providers, sorted by lowest rate |
| `positions(params)` | Returns positions from ALL providers for the wallet |
| `getMarket(params)` | Returns market from the provider matching the market ID |
| `execute(params)` | Uses the provider for the specified market |

---

## Types and Interfaces

### Configuration Types

```typescript
// packages/sdk/src/types/borrow/base.ts

import type { Address } from 'viem'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

/**
 * Borrow provider configuration
 * @description Configuration for a single borrow provider (mirrors LendProviderConfig pattern)
 */
export interface BorrowProviderConfig {
  /** Maximum allowed LTV ratio (e.g., 0.75 for 75%). Overrides protocol max as a safety cap. */
  maxLtv?: number
  /** Minimum health factor to allow borrows (e.g., 1.2). Prevents risky positions. */
  minHealthFactor?: number
  /** Collateral allowlist (optional - defaults to all supported collateral) */
  collateralAllowlist?: CollateralConfig[]
  /** Collateral blocklist - exclude specific collateral assets */
  collateralBlocklist?: CollateralConfig[]
  /** Borrowable asset allowlist (optional - defaults to all supported) */
  assetAllowlist?: AssetBorrowConfig[]
  /** Borrowable asset blocklist */
  assetBlocklist?: AssetBorrowConfig[]
}

/**
 * Collateral configuration
 */
export interface CollateralConfig {
  /** Collateral asset */
  asset: Asset
  /** Chain ID */
  chainId: SupportedChainId
}

/**
 * Borrowable asset configuration
 */
export interface AssetBorrowConfig {
  /** Borrowable asset */
  asset: Asset
  /** Chain ID */
  chainId: SupportedChainId
}
```

### ActionsConfig Extension

```typescript
// packages/sdk/src/types/actions.ts (additions)

import type { BorrowProviderConfig } from '@/types/borrow/index.js'

/**
 * Borrow configuration
 * @description Configuration for all borrow providers. Multiple providers can be
 * configured simultaneously - the SDK will aggregate results across all providers
 * for methods like getMarkets() and rates().
 */
export interface BorrowConfig {
  /** Aave borrow provider configuration */
  aave?: BorrowProviderConfig
  /** Compound borrow provider configuration */
  compound?: BorrowProviderConfig
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
  borrow?: BorrowConfig  // NEW
  swap?: SwapConfig
  assets?: AssetsConfig
  chains: ChainConfig[]
}
```

### Borrow Operation Types

```typescript
// packages/sdk/src/types/borrow/base.ts (continued)

import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

/**
 * Interest rate mode
 */
export type InterestRateMode = 'variable' | 'stable'

/**
 * Parameters for executing a borrow
 */
export interface BorrowExecuteParams {
  /** Asset to borrow */
  asset: Asset
  /** Amount to borrow (human-readable, e.g., 1000 for 1000 USDC) */
  amount: number
  /** Collateral asset backing the borrow. Must already be supplied. */
  collateralAsset: Asset
  /** Chain to execute borrow on */
  chainId: SupportedChainId
  /** Interest rate mode. Defaults to 'variable'. */
  rateMode?: InterestRateMode
  /** Recipient of borrowed funds. Defaults to wallet address. */
  recipient?: Address
}

/**
 * Internal parameters after validation and conversion
 */
export interface BorrowExecuteInternalParams {
  asset: Asset
  amountWei: bigint
  collateralAsset: Asset
  chainId: SupportedChainId
  rateMode: InterestRateMode
  recipient: Address
  walletAddress: Address
}

/**
 * Parameters for repaying a borrow
 */
export interface BorrowRepayParams {
  /** Asset to repay */
  asset: Asset
  /** Amount to repay (human-readable) or 'max' for full repay */
  amount: number | 'max'
  /** Chain to execute repay on */
  chainId: SupportedChainId
  /** Interest rate mode of the position to repay. Defaults to 'variable'. */
  rateMode?: InterestRateMode
}

/**
 * Internal repay parameters after validation
 */
export interface BorrowRepayInternalParams {
  asset: Asset
  amountWei: bigint
  isMaxRepay: boolean
  chainId: SupportedChainId
  rateMode: InterestRateMode
  walletAddress: Address
}

/**
 * Parameters for querying borrow positions
 */
export interface BorrowPositionsParams {
  /** Chain to query positions on */
  chainId: SupportedChainId
  /** Filter by borrowed asset (optional) */
  asset?: Asset
}

/**
 * Parameters for getting borrow rates
 */
export interface BorrowRateParams {
  /** Asset to get borrow rate for */
  asset: Asset
  /** Chain to get rate on */
  chainId: SupportedChainId
}

/**
 * Borrow rate information
 */
export interface BorrowRate {
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

/**
 * Borrow rate with provider attribution
 */
export interface BorrowRateWithProvider extends BorrowRate {
  /** Provider name (e.g., 'aave', 'compound') */
  provider: string
}

/**
 * Borrow position
 */
export interface BorrowPosition {
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
  rateMode: InterestRateMode
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

/**
 * Transaction data for borrow execution
 */
export interface BorrowTransactionData {
  /** Token approval for repayment (if needed) */
  approval?: TransactionData
  /** Main borrow or repay transaction */
  transaction: TransactionData
}

/**
 * Borrow transaction result
 */
export interface BorrowTransaction {
  /** Borrowed amount (wei) */
  amount: bigint
  /** Borrowed asset */
  asset: Asset
  /** Collateral asset */
  collateralAsset: Asset
  /** Interest rate mode */
  rateMode: InterestRateMode
  /** Borrow APR at time of execution */
  borrowRate: number
  /** Post-borrow health factor */
  healthFactor: number
  /** Transaction data for execution */
  transactionData: BorrowTransactionData
}

/**
 * Borrow execution receipt
 */
export interface BorrowReceipt {
  /** Transaction receipt(s) */
  receipt: TransactionReturnType | BatchTransactionReturnType
  /** Borrowed amount (wei) */
  amount: bigint
  /** Human-readable borrowed amount */
  amountFormatted: string
  /** Borrowed asset */
  asset: Asset
  /** Collateral asset */
  collateralAsset: Asset
  /** Interest rate mode */
  rateMode: InterestRateMode
  /** Borrow APR at time of execution */
  borrowRate: number
  /** Post-borrow health factor */
  healthFactor: number
}

/**
 * Repay transaction result
 */
export interface RepayTransaction {
  /** Repaid amount (wei) */
  amount: bigint
  /** Repaid asset */
  asset: Asset
  /** Interest rate mode */
  rateMode: InterestRateMode
  /** Remaining debt after repay (wei) */
  remainingDebt: bigint
  /** Post-repay health factor */
  healthFactor: number
  /** Transaction data for execution */
  transactionData: BorrowTransactionData
}

/**
 * Repay execution receipt
 */
export interface BorrowRepayReceipt {
  /** Transaction receipt(s) */
  receipt: TransactionReturnType | BatchTransactionReturnType
  /** Repaid amount (wei) */
  amount: bigint
  /** Human-readable repaid amount */
  amountFormatted: string
  /** Repaid asset */
  asset: Asset
  /** Remaining debt (wei) */
  remainingDebt: bigint
  /** Human-readable remaining debt */
  remainingDebtFormatted: string
  /** Post-repay health factor */
  healthFactor: number
}
```

### Market Types

```typescript
// packages/sdk/src/types/borrow/base.ts (continued)

/**
 * Borrow market identifier
 * @description Unique identifier for a borrow market (mirrors LendMarketId pattern)
 */
export type BorrowMarketId = {
  /** Market identifier (protocol-specific, e.g., reserve address for Aave) */
  marketId: string
  /** Chain ID where this market exists */
  chainId: SupportedChainId
}

/**
 * Parameters for getting a specific borrow market
 */
export type GetBorrowMarketParams = BorrowMarketId

/**
 * Parameters for getting borrow markets
 */
export interface GetBorrowMarketsParams {
  /** Filter by chain ID */
  chainId?: SupportedChainId
  /** Filter by borrowable asset */
  asset?: Asset
  /** Filter by collateral asset */
  collateralAsset?: Asset
}

/**
 * Borrow market information
 */
export interface BorrowMarket {
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
  /** Total borrowed from this market (wei) */
  totalBorrowed: bigint
  /** Utilization rate (0.80 = 80%) */
  utilizationRate: number
  /** Maximum LTV for each collateral asset (keyed by symbol) */
  maxLtv: Record<string, number>
  /** Liquidation threshold for each collateral (keyed by symbol) */
  liquidationThreshold: Record<string, number>
  /** Liquidation penalty for each collateral (keyed by symbol, 0.05 = 5%) */
  liquidationPenalty: Record<string, number>
  /** Whether stable rate borrowing is enabled */
  stableRateEnabled: boolean
  /** Provider name */
  provider: string
}
```

### Provider Method Types

```typescript
// packages/sdk/src/types/borrow/base.ts (continued)

/**
 * Protected method signatures for BorrowProvider implementations
 */
export interface BorrowProviderMethods {
  _execute(params: BorrowExecuteInternalParams): Promise<BorrowTransaction>
  _repay(params: BorrowRepayInternalParams): Promise<RepayTransaction>
  _getPositions(params: BorrowPositionsParams & { walletAddress: Address }): Promise<BorrowPosition[]>
  _getRate(params: BorrowRateParams): Promise<BorrowRate>
  _getMarket(params: GetBorrowMarketParams): Promise<BorrowMarket>
  _getMarkets(params: GetBorrowMarketsParams): Promise<BorrowMarket[]>
}
```

---

## Core Classes

### BorrowProvider Abstract Base Class

```typescript
// packages/sdk/src/borrow/core/BorrowProvider.ts

import type { Address } from 'viem'
import { parseUnits } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type {
  BorrowProviderConfig,
  BorrowExecuteParams,
  BorrowExecuteInternalParams,
  BorrowRepayParams,
  BorrowRepayInternalParams,
  BorrowPositionsParams,
  BorrowRateParams,
  BorrowRate,
  BorrowTransaction,
  RepayTransaction,
  BorrowPosition,
  CollateralConfig,
  AssetBorrowConfig,
  InterestRateMode,
} from '@/types/borrow/base.js'
import { isAssetSupportedOnChain } from '@/utils/assets.js'

/** Default interest rate mode */
const DEFAULT_RATE_MODE: InterestRateMode = 'variable'

/** Default minimum health factor safety margin */
const DEFAULT_MIN_HEALTH_FACTOR = 1.0

/**
 * Abstract base class for borrow providers
 * @description Defines the interface for all borrow provider implementations.
 * Uses template method pattern - public methods handle validation and conversion,
 * protected abstract methods implement provider-specific logic.
 */
export abstract class BorrowProvider<
  TConfig extends BorrowProviderConfig = BorrowProviderConfig,
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

  /** Minimum health factor from config or provider default */
  get minHealthFactor(): number {
    return this._config.minHealthFactor ?? DEFAULT_MIN_HEALTH_FACTOR
  }

  /** Maximum LTV from config (undefined means use protocol default) */
  get maxLtv(): number | undefined {
    return this._config.maxLtv
  }

  /**
   * Execute a borrow
   * @param params - Borrow parameters
   * @returns Borrow transaction data ready for execution
   */
  async execute(params: BorrowExecuteParams & {
    walletAddress: Address
    chainId: SupportedChainId
  }): Promise<BorrowTransaction> {
    // Validate chain support
    this.validateChainSupported(params.chainId)

    // Validate asset is borrowable on chain
    if (!isAssetSupportedOnChain(params.asset, params.chainId)) {
      throw new Error(
        `Asset ${params.asset.metadata.symbol} not supported on chain ${params.chainId}`
      )
    }

    // Validate collateral asset is supported
    if (!isAssetSupportedOnChain(params.collateralAsset, params.chainId)) {
      throw new Error(
        `Collateral asset ${params.collateralAsset.metadata.symbol} not supported on chain ${params.chainId}`
      )
    }

    // Validate asset is allowed for borrowing
    this.validateAssetAllowed(params.asset, params.chainId)

    // Validate collateral is allowed
    this.validateCollateralAllowed(params.collateralAsset, params.chainId)

    // Convert amount to wei
    const amountWei = parseUnits(
      params.amount.toString(),
      params.asset.metadata.decimals
    )

    // Build internal params with defaults
    const internalParams: BorrowExecuteInternalParams = {
      asset: params.asset,
      amountWei,
      collateralAsset: params.collateralAsset,
      chainId: params.chainId,
      rateMode: params.rateMode ?? DEFAULT_RATE_MODE,
      recipient: params.recipient ?? params.walletAddress,
      walletAddress: params.walletAddress,
    }

    // Execute and validate health factor
    const result = await this._execute(internalParams)

    if (result.healthFactor < this.minHealthFactor) {
      throw new Error(
        `Borrow would result in health factor ${result.healthFactor.toFixed(2)}, ` +
        `below minimum ${this.minHealthFactor.toFixed(2)}. ` +
        `Reduce borrow amount or add more collateral.`
      )
    }

    // Validate LTV cap
    if (this.maxLtv !== undefined) {
      const positions = await this._getPositions({
        chainId: params.chainId,
        walletAddress: params.walletAddress,
      })
      const position = positions.find(
        (p) => p.asset.metadata.symbol === params.asset.metadata.symbol
      )
      if (position && position.ltv > this.maxLtv) {
        throw new Error(
          `Borrow would result in LTV ${(position.ltv * 100).toFixed(1)}%, ` +
          `exceeding max ${(this.maxLtv * 100).toFixed(1)}%. ` +
          `Reduce borrow amount or add more collateral.`
        )
      }
    }

    return result
  }

  /**
   * Repay a borrow position
   * @param params - Repay parameters
   * @returns Repay transaction data ready for execution
   */
  async repay(params: BorrowRepayParams & {
    walletAddress: Address
    chainId: SupportedChainId
  }): Promise<RepayTransaction> {
    this.validateChainSupported(params.chainId)

    if (!isAssetSupportedOnChain(params.asset, params.chainId)) {
      throw new Error(
        `Asset ${params.asset.metadata.symbol} not supported on chain ${params.chainId}`
      )
    }

    const isMaxRepay = params.amount === 'max'
    const amountWei = isMaxRepay
      ? BigInt(2) ** BigInt(256) - BigInt(1) // type(uint256).max for full repay
      : parseUnits(
          (params.amount as number).toString(),
          params.asset.metadata.decimals
        )

    const internalParams: BorrowRepayInternalParams = {
      asset: params.asset,
      amountWei,
      isMaxRepay,
      chainId: params.chainId,
      rateMode: params.rateMode ?? DEFAULT_RATE_MODE,
      walletAddress: params.walletAddress,
    }

    return this._repay(internalParams)
  }

  /**
   * Get borrow positions for a wallet
   */
  async getPositions(params: BorrowPositionsParams & {
    walletAddress: Address
  }): Promise<BorrowPosition[]> {
    if (params.chainId) {
      this.validateChainSupported(params.chainId)
    }
    return this._getPositions(params)
  }

  /**
   * Get borrow rate for an asset
   */
  async getRate(params: BorrowRateParams): Promise<BorrowRate> {
    this.validateChainSupported(params.chainId)
    return this._getRate(params)
  }

  /**
   * Get a specific borrow market
   */
  async getMarket(params: GetBorrowMarketParams): Promise<BorrowMarket> {
    this.validateChainSupported(params.chainId)
    return this._getMarket(params)
  }

  /**
   * Get available borrow markets
   */
  async getMarkets(params: GetBorrowMarketsParams = {}): Promise<BorrowMarket[]> {
    if (params.chainId) {
      this.validateChainSupported(params.chainId)
    }
    return this._getMarkets(params)
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
    params: BorrowExecuteInternalParams
  ): Promise<BorrowTransaction>

  protected abstract _repay(
    params: BorrowRepayInternalParams
  ): Promise<RepayTransaction>

  protected abstract _getPositions(
    params: BorrowPositionsParams & { walletAddress: Address }
  ): Promise<BorrowPosition[]>

  protected abstract _getRate(params: BorrowRateParams): Promise<BorrowRate>

  protected abstract _getMarket(params: GetBorrowMarketParams): Promise<BorrowMarket>

  protected abstract _getMarkets(params: GetBorrowMarketsParams): Promise<BorrowMarket[]>

  // ─────────────────────────────────────────────────────────────────────────────
  // Protected validation helpers
  // ─────────────────────────────────────────────────────────────────────────────

  protected validateChainSupported(chainId: SupportedChainId): void {
    if (!this.isChainSupported(chainId)) {
      throw new Error(
        `Chain ${chainId} is not supported by this borrow provider. ` +
        `Supported chains: ${this.supportedChainIds().join(', ')}`
      )
    }
  }

  protected validateCollateralAllowed(
    asset: Asset,
    chainId: SupportedChainId
  ): void {
    const { collateralAllowlist, collateralBlocklist } = this._config

    if (collateralBlocklist?.length) {
      const isBlocked = this.isAssetInList(asset, chainId, collateralBlocklist)
      if (isBlocked) {
        throw new Error(
          `Collateral ${asset.metadata.symbol} is blocked on chain ${chainId}`
        )
      }
    }

    if (collateralAllowlist?.length) {
      const isAllowed = this.isAssetInList(asset, chainId, collateralAllowlist)
      if (!isAllowed) {
        throw new Error(
          `Collateral ${asset.metadata.symbol} is not in the allowlist for chain ${chainId}`
        )
      }
    }
  }

  protected validateAssetAllowed(
    asset: Asset,
    chainId: SupportedChainId
  ): void {
    const { assetAllowlist, assetBlocklist } = this._config

    if (assetBlocklist?.length) {
      const isBlocked = this.isAssetInList(asset, chainId, assetBlocklist)
      if (isBlocked) {
        throw new Error(
          `Asset ${asset.metadata.symbol} is blocked for borrowing on chain ${chainId}`
        )
      }
    }

    if (assetAllowlist?.length) {
      const isAllowed = this.isAssetInList(asset, chainId, assetAllowlist)
      if (!isAllowed) {
        throw new Error(
          `Asset ${asset.metadata.symbol} is not in the borrow allowlist for chain ${chainId}`
        )
      }
    }
  }

  private isAssetInList(
    asset: Asset,
    chainId: SupportedChainId,
    list: CollateralConfig[] | AssetBorrowConfig[]
  ): boolean {
    return list.some(
      (config) =>
        config.asset.metadata.symbol.toLowerCase() ===
          asset.metadata.symbol.toLowerCase() &&
        config.chainId === chainId
    )
  }
}
```

### AaveBorrowProvider Implementation

```typescript
// packages/sdk/src/borrow/providers/aave/AaveBorrowProvider.ts

import type { Address } from 'viem'
import { encodeFunctionData, maxUint256 } from 'viem'

import { BorrowProvider } from '@/borrow/core/BorrowProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  BorrowProviderConfig,
  BorrowExecuteInternalParams,
  BorrowRepayInternalParams,
  BorrowPositionsParams,
  BorrowRateParams,
  BorrowRate,
  BorrowTransaction,
  RepayTransaction,
  BorrowPosition,
  BorrowMarket,
  GetBorrowMarketParams,
  GetBorrowMarketsParams,
  InterestRateMode,
  TransactionData,
} from '@/types/borrow/base.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

import { getAaveAddresses, getSupportedChainIds } from './addresses.js'
import {
  getUserAccountData,
  getReserveData,
  getReservesList,
  getReserveConfigurationData,
} from './sdk.js'

/** Aave interest rate mode constants */
const AAVE_RATE_MODE = {
  stable: 1n,
  variable: 2n,
} as const

/**
 * Aave V3 borrow provider
 * @description Implements borrowing via the Aave V3 Pool contract.
 * Supports variable and stable interest rates, multiple collateral types,
 * and health factor monitoring.
 */
export class AaveBorrowProvider extends BorrowProvider<BorrowProviderConfig> {
  constructor(config: BorrowProviderConfig, chainManager: ChainManager) {
    super(config, chainManager)
  }

  supportedChainIds(): SupportedChainId[] {
    return getSupportedChainIds()
  }

  protected async _execute(
    params: BorrowExecuteInternalParams
  ): Promise<BorrowTransaction> {
    const { chainId, asset, amountWei, rateMode, recipient, walletAddress } = params
    const addresses = getAaveAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    const assetAddress = isNativeAsset(asset)
      ? addresses.wrappedNative
      : getAssetAddress(asset, chainId)

    // Get current account data for health factor calculation
    const preAccountData = await getUserAccountData({
      publicClient,
      poolAddress: addresses.pool,
      userAddress: walletAddress,
    })

    // Build borrow transaction
    const borrowTx: TransactionData = {
      to: addresses.pool,
      data: encodeFunctionData({
        abi: AAVE_POOL_ABI,
        functionName: 'borrow',
        args: [
          assetAddress,
          amountWei,
          AAVE_RATE_MODE[rateMode],
          0, // referralCode
          recipient,
        ],
      }),
      value: 0n,
    }

    // Get reserve data for current rate
    const reserveData = await getReserveData({
      publicClient,
      poolAddress: addresses.pool,
      asset: assetAddress,
    })

    const borrowRate = rateMode === 'variable'
      ? Number(reserveData.currentVariableBorrowRate) / 1e27
      : Number(reserveData.currentStableBorrowRate) / 1e27

    // Estimate post-borrow health factor
    const healthFactor = this.estimatePostBorrowHealthFactor(
      preAccountData,
      amountWei,
      asset,
      chainId
    )

    return {
      amount: amountWei,
      asset,
      collateralAsset: params.collateralAsset,
      rateMode,
      borrowRate,
      healthFactor,
      transactionData: {
        transaction: borrowTx,
      },
    }
  }

  protected async _repay(
    params: BorrowRepayInternalParams
  ): Promise<RepayTransaction> {
    const { chainId, asset, amountWei, isMaxRepay, rateMode, walletAddress } = params
    const addresses = getAaveAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    const assetAddress = isNativeAsset(asset)
      ? addresses.wrappedNative
      : getAssetAddress(asset, chainId)

    // For max repay, use type(uint256).max
    const repayAmount = isMaxRepay ? maxUint256 : amountWei

    // Check if approval needed
    let approval: TransactionData | undefined
    const allowance = await publicClient.readContract({
      address: assetAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [walletAddress, addresses.pool],
    })

    if (allowance < repayAmount && !isMaxRepay) {
      approval = {
        to: assetAddress,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [addresses.pool, repayAmount],
        }),
        value: 0n,
      }
    } else if (isMaxRepay && allowance < maxUint256) {
      // For max repay, approve max
      approval = {
        to: assetAddress,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [addresses.pool, maxUint256],
        }),
        value: 0n,
      }
    }

    // Build repay transaction
    const repayTx: TransactionData = {
      to: addresses.pool,
      data: encodeFunctionData({
        abi: AAVE_POOL_ABI,
        functionName: 'repay',
        args: [
          assetAddress,
          repayAmount,
          AAVE_RATE_MODE[rateMode],
          walletAddress,
        ],
      }),
      value: 0n,
    }

    // Get current debt to calculate remaining
    const accountData = await getUserAccountData({
      publicClient,
      poolAddress: addresses.pool,
      userAddress: walletAddress,
    })

    const currentDebt = accountData.totalDebtBase
    const remainingDebt = isMaxRepay ? 0n : currentDebt - amountWei
    const healthFactor = Number(accountData.healthFactor) / 1e18

    return {
      amount: isMaxRepay ? currentDebt : amountWei,
      asset,
      rateMode,
      remainingDebt,
      healthFactor,
      transactionData: {
        approval,
        transaction: repayTx,
      },
    }
  }

  protected async _getPositions(
    params: BorrowPositionsParams & { walletAddress: Address }
  ): Promise<BorrowPosition[]> {
    const { chainId, walletAddress, asset } = params
    const addresses = getAaveAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    // Get user account data
    const accountData = await getUserAccountData({
      publicClient,
      poolAddress: addresses.pool,
      userAddress: walletAddress,
    })

    // Get reserves list to check each reserve for borrows
    const reserves = await getReservesList({
      publicClient,
      poolAddress: addresses.pool,
    })

    const positions: BorrowPosition[] = []

    for (const reserveAddress of reserves) {
      // Get user reserve data for each reserve
      const userReserveData = await publicClient.readContract({
        address: addresses.pool,
        abi: AAVE_POOL_ABI,
        functionName: 'getUserReserveData',
        args: [reserveAddress, walletAddress],
      })

      const variableDebt = userReserveData.currentVariableDebt
      const stableDebt = userReserveData.currentStableDebt

      if (variableDebt === 0n && stableDebt === 0n) continue

      // Filter by asset if specified
      // (match reserve address to asset)
      if (asset) {
        const assetAddress = getAssetAddress(asset, chainId)
        if (reserveAddress.toLowerCase() !== assetAddress.toLowerCase()) continue
      }

      const reserveConfig = await getReserveConfigurationData({
        publicClient,
        poolAddress: addresses.pool,
        asset: reserveAddress,
      })

      const reserveData = await getReserveData({
        publicClient,
        poolAddress: addresses.pool,
        asset: reserveAddress,
      })

      // Build position for variable debt
      if (variableDebt > 0n) {
        positions.push({
          asset: this.addressToAsset(reserveAddress, chainId),
          collateralAsset: this.addressToAsset(reserveAddress, chainId), // Simplified
          debt: variableDebt,
          debtFormatted: this.formatAmount(variableDebt, reserveAddress, chainId),
          borrowRate: Number(reserveData.currentVariableBorrowRate) / 1e27,
          rateMode: 'variable',
          collateralValue: accountData.totalCollateralBase,
          ltv: Number(accountData.ltv) / 10000,
          healthFactor: Number(accountData.healthFactor) / 1e18,
          liquidationThreshold: Number(reserveConfig.liquidationThreshold) / 10000,
          provider: 'aave',
        })
      }

      // Build position for stable debt
      if (stableDebt > 0n) {
        positions.push({
          asset: this.addressToAsset(reserveAddress, chainId),
          collateralAsset: this.addressToAsset(reserveAddress, chainId),
          debt: stableDebt,
          debtFormatted: this.formatAmount(stableDebt, reserveAddress, chainId),
          borrowRate: Number(reserveData.currentStableBorrowRate) / 1e27,
          rateMode: 'stable',
          collateralValue: accountData.totalCollateralBase,
          ltv: Number(accountData.ltv) / 10000,
          healthFactor: Number(accountData.healthFactor) / 1e18,
          liquidationThreshold: Number(reserveConfig.liquidationThreshold) / 10000,
          provider: 'aave',
        })
      }
    }

    return positions
  }

  protected async _getRate(params: BorrowRateParams): Promise<BorrowRate> {
    const { asset, chainId } = params
    const addresses = getAaveAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    const assetAddress = isNativeAsset(asset)
      ? addresses.wrappedNative
      : getAssetAddress(asset, chainId)

    const reserveData = await getReserveData({
      publicClient,
      poolAddress: addresses.pool,
      asset: assetAddress,
    })

    const availableLiquidity = reserveData.availableLiquidity
    const totalBorrowed = reserveData.totalStableDebt + reserveData.totalVariableDebt
    const totalSupply = availableLiquidity + totalBorrowed
    const utilizationRate = totalSupply > 0n
      ? Number(totalBorrowed * 10000n / totalSupply) / 10000
      : 0

    return {
      variableRate: Number(reserveData.currentVariableBorrowRate) / 1e27,
      stableRate: Number(reserveData.currentStableBorrowRate) / 1e27,
      availableLiquidity,
      availableLiquidityFormatted: this.formatAmount(availableLiquidity, assetAddress, chainId),
      utilizationRate,
    }
  }

  protected async _getMarket(params: GetBorrowMarketParams): Promise<BorrowMarket> {
    const { marketId, chainId } = params
    const addresses = getAaveAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    const reserveData = await getReserveData({
      publicClient,
      poolAddress: addresses.pool,
      asset: marketId as Address,
    })

    const reserveConfig = await getReserveConfigurationData({
      publicClient,
      poolAddress: addresses.pool,
      asset: marketId as Address,
    })

    return this.buildMarketFromReserve(
      marketId as Address,
      reserveData,
      reserveConfig,
      chainId
    )
  }

  protected async _getMarkets(params: GetBorrowMarketsParams): Promise<BorrowMarket[]> {
    const chainIds = params.chainId
      ? [params.chainId]
      : this.supportedChainIds()

    const results = await Promise.all(
      chainIds.map((chainId) => this.fetchMarketsForChain(chainId, params.asset))
    )

    return results.flat()
  }

  private async fetchMarketsForChain(
    chainId: SupportedChainId,
    asset?: Asset
  ): Promise<BorrowMarket[]> {
    const addresses = getAaveAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    const reserves = await getReservesList({
      publicClient,
      poolAddress: addresses.pool,
    })

    const markets: BorrowMarket[] = []

    for (const reserveAddress of reserves) {
      // Filter by asset if specified
      if (asset) {
        const assetAddress = getAssetAddress(asset, chainId)
        if (reserveAddress.toLowerCase() !== assetAddress.toLowerCase()) continue
      }

      const reserveData = await getReserveData({
        publicClient,
        poolAddress: addresses.pool,
        asset: reserveAddress,
      })

      const reserveConfig = await getReserveConfigurationData({
        publicClient,
        poolAddress: addresses.pool,
        asset: reserveAddress,
      })

      // Only include reserves that allow borrowing
      if (!reserveConfig.borrowingEnabled) continue

      markets.push(
        this.buildMarketFromReserve(reserveAddress, reserveData, reserveConfig, chainId)
      )
    }

    return markets
  }

  private buildMarketFromReserve(
    reserveAddress: Address,
    reserveData: any,
    reserveConfig: any,
    chainId: SupportedChainId
  ): BorrowMarket {
    const availableLiquidity = reserveData.availableLiquidity
    const totalBorrowed = reserveData.totalStableDebt + reserveData.totalVariableDebt
    const totalSupply = availableLiquidity + totalBorrowed

    return {
      marketId: {
        marketId: reserveAddress,
        chainId,
      },
      asset: this.addressToAsset(reserveAddress, chainId),
      collateralAssets: [], // Populated from reserve config
      variableRate: Number(reserveData.currentVariableBorrowRate) / 1e27,
      stableRate: Number(reserveData.currentStableBorrowRate) / 1e27,
      availableLiquidity,
      totalBorrowed,
      utilizationRate: totalSupply > 0n
        ? Number(totalBorrowed * 10000n / totalSupply) / 10000
        : 0,
      maxLtv: { default: Number(reserveConfig.ltv) / 10000 },
      liquidationThreshold: {
        default: Number(reserveConfig.liquidationThreshold) / 10000,
      },
      liquidationPenalty: {
        default: Number(reserveConfig.liquidationBonus - 10000n) / 10000,
      },
      stableRateEnabled: reserveConfig.stableBorrowRateEnabled,
      provider: 'aave',
    }
  }

  private estimatePostBorrowHealthFactor(
    accountData: any,
    borrowAmountWei: bigint,
    asset: Asset,
    chainId: SupportedChainId
  ): number {
    // Simplified estimation
    // Real implementation would use oracle prices to convert
    const currentHf = Number(accountData.healthFactor) / 1e18
    const totalCollateral = accountData.totalCollateralBase
    const totalDebt = accountData.totalDebtBase

    if (totalDebt === 0n && borrowAmountWei > 0n) {
      // First borrow - estimate based on collateral/borrow ratio
      return currentHf
    }

    // Approximate: new HF = old HF * oldDebt / (oldDebt + newBorrow)
    const newTotalDebt = totalDebt + borrowAmountWei
    return Number(totalCollateral * 10000n / newTotalDebt) / 10000
  }

  private addressToAsset(address: Address, chainId: SupportedChainId): Asset {
    // Map reserve address to known Asset
    // Implementation would look up from supported tokens registry
    return {
      type: 'erc20',
      address: { [chainId]: address },
      metadata: { name: '', symbol: '', decimals: 18 },
    }
  }

  private formatAmount(
    amount: bigint,
    tokenAddress: Address,
    chainId: SupportedChainId
  ): string {
    // Implementation would use token decimals
    return (Number(amount) / 1e18).toString()
  }
}

// Aave V3 Pool ABI (subset for borrowing)
const AAVE_POOL_ABI = [
  {
    name: 'borrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'referralCode', type: 'uint16' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'repay',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
  {
    name: 'getUserReserveData',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'user', type: 'address' },
    ],
    outputs: [
      { name: 'currentATokenBalance', type: 'uint256' },
      { name: 'currentStableDebt', type: 'uint256' },
      { name: 'currentVariableDebt', type: 'uint256' },
      { name: 'principalStableDebt', type: 'uint256' },
      { name: 'scaledVariableDebt', type: 'uint256' },
      { name: 'stableBorrowRate', type: 'uint256' },
      { name: 'liquidityRate', type: 'uint256' },
      { name: 'stableRateLastUpdated', type: 'uint40' },
      { name: 'usageAsCollateralEnabled', type: 'bool' },
    ],
  },
  {
    name: 'getReserveData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      { name: 'configuration', type: 'uint256' },
      { name: 'liquidityIndex', type: 'uint128' },
      { name: 'currentLiquidityRate', type: 'uint128' },
      { name: 'variableBorrowIndex', type: 'uint128' },
      { name: 'currentVariableBorrowRate', type: 'uint128' },
      { name: 'currentStableBorrowRate', type: 'uint128' },
      { name: 'lastUpdateTimestamp', type: 'uint40' },
      { name: 'id', type: 'uint16' },
      { name: 'aTokenAddress', type: 'address' },
      { name: 'stableDebtTokenAddress', type: 'address' },
      { name: 'variableDebtTokenAddress', type: 'address' },
      { name: 'interestRateStrategyAddress', type: 'address' },
      { name: 'accruedToTreasury', type: 'uint128' },
      { name: 'unbacked', type: 'uint128' },
      { name: 'isolationModeTotalDebt', type: 'uint128' },
    ],
  },
  {
    name: 'getReservesList',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address[]' }],
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

### SDK Wrapper

```typescript
// packages/sdk/src/borrow/providers/aave/sdk.ts

/**
 * Aave V3 SDK wrapper
 * @description Wraps Aave V3 Pool contract calls for borrow operations.
 * Handles getUserAccountData, getReserveData, and reserve configuration reads.
 */

import type { PublicClient, Address } from 'viem'

interface UserAccountData {
  totalCollateralBase: bigint
  totalDebtBase: bigint
  availableBorrowsBase: bigint
  currentLiquidationThreshold: bigint
  ltv: bigint
  healthFactor: bigint
}

/**
 * Get user account data from Aave Pool
 */
export async function getUserAccountData(params: {
  publicClient: PublicClient
  poolAddress: Address
  userAddress: Address
}): Promise<UserAccountData> {
  const result = await params.publicClient.readContract({
    address: params.poolAddress,
    abi: POOL_ABI,
    functionName: 'getUserAccountData',
    args: [params.userAddress],
  })

  return {
    totalCollateralBase: result[0],
    totalDebtBase: result[1],
    availableBorrowsBase: result[2],
    currentLiquidationThreshold: result[3],
    ltv: result[4],
    healthFactor: result[5],
  }
}

interface ReserveData {
  availableLiquidity: bigint
  totalStableDebt: bigint
  totalVariableDebt: bigint
  currentVariableBorrowRate: bigint
  currentStableBorrowRate: bigint
  currentLiquidityRate: bigint
}

/**
 * Get reserve data for a specific asset
 */
export async function getReserveData(params: {
  publicClient: PublicClient
  poolAddress: Address
  asset: Address
}): Promise<ReserveData> {
  const result = await params.publicClient.readContract({
    address: params.poolAddress,
    abi: POOL_ABI,
    functionName: 'getReserveData',
    args: [params.asset],
  })

  // Note: availableLiquidity needs to be computed from aToken supply
  // This is simplified - real implementation reads aToken balance
  return {
    availableLiquidity: 0n, // Computed from aToken
    totalStableDebt: 0n,
    totalVariableDebt: 0n,
    currentVariableBorrowRate: result[4],
    currentStableBorrowRate: result[5],
    currentLiquidityRate: result[2],
  }
}

interface ReserveConfigurationData {
  ltv: bigint
  liquidationThreshold: bigint
  liquidationBonus: bigint
  borrowingEnabled: boolean
  stableBorrowRateEnabled: boolean
}

/**
 * Get reserve configuration data
 */
export async function getReserveConfigurationData(params: {
  publicClient: PublicClient
  poolAddress: Address
  asset: Address
}): Promise<ReserveConfigurationData> {
  // Aave stores configuration as packed uint256
  // Real implementation decodes the configuration bitmap
  const result = await params.publicClient.readContract({
    address: params.poolAddress,
    abi: POOL_ABI,
    functionName: 'getReserveData',
    args: [params.asset],
  })

  const config = result[0] as bigint

  // Decode configuration bitmap
  // Bits 0-15: LTV
  // Bits 16-31: Liquidation threshold
  // Bits 32-47: Liquidation bonus
  // Bit 58: Borrowing enabled
  // Bit 59: Stable rate borrowing enabled
  return {
    ltv: config & 0xFFFFn,
    liquidationThreshold: (config >> 16n) & 0xFFFFn,
    liquidationBonus: (config >> 32n) & 0xFFFFn,
    borrowingEnabled: ((config >> 58n) & 1n) === 1n,
    stableBorrowRateEnabled: ((config >> 59n) & 1n) === 1n,
  }
}

/**
 * Get all reserve addresses
 */
export async function getReservesList(params: {
  publicClient: PublicClient
  poolAddress: Address
}): Promise<Address[]> {
  return params.publicClient.readContract({
    address: params.poolAddress,
    abi: POOL_ABI,
    functionName: 'getReservesList',
  }) as Promise<Address[]>
}

const POOL_ABI = [
  {
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
  {
    name: 'getReserveData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      { name: 'configuration', type: 'uint256' },
      { name: 'liquidityIndex', type: 'uint128' },
      { name: 'currentLiquidityRate', type: 'uint128' },
      { name: 'variableBorrowIndex', type: 'uint128' },
      { name: 'currentVariableBorrowRate', type: 'uint128' },
      { name: 'currentStableBorrowRate', type: 'uint128' },
      { name: 'lastUpdateTimestamp', type: 'uint40' },
      { name: 'id', type: 'uint16' },
      { name: 'aTokenAddress', type: 'address' },
      { name: 'stableDebtTokenAddress', type: 'address' },
      { name: 'variableDebtTokenAddress', type: 'address' },
      { name: 'interestRateStrategyAddress', type: 'address' },
      { name: 'accruedToTreasury', type: 'uint128' },
      { name: 'unbacked', type: 'uint128' },
      { name: 'isolationModeTotalDebt', type: 'uint128' },
    ],
  },
  {
    name: 'getReservesList',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address[]' }],
  },
] as const
```

### Contract Addresses

```typescript
// packages/sdk/src/borrow/providers/aave/addresses.ts

/**
 * Aave V3 contract addresses per chain
 * @description Addresses from https://docs.aave.com/developers/deployed-contracts
 */

import type { Address } from 'viem'
import { base, baseSepolia, optimism } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'

interface AaveAddresses {
  pool: Address
  poolDataProvider: Address
  oracle: Address
  wrappedNative: Address
}

const AAVE_ADDRESSES: Partial<Record<SupportedChainId, AaveAddresses>> = {
  // Base (8453)
  [base.id]: {
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    poolDataProvider: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac',
    oracle: '0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156',
    wrappedNative: '0x4200000000000000000000000000000000000006',
  },
  // Base Sepolia (84532)
  [baseSepolia.id]: {
    pool: '0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b',
    poolDataProvider: '0x80f2c50224571826CF3e3B2110cE2098276bD1B4',
    oracle: '0x2Da88497588bf726262A9B090EF4134e3f201F09',
    wrappedNative: '0x4200000000000000000000000000000000000006',
  },
  // Optimism (10)
  [optimism.id]: {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
    oracle: '0xD81eb3728a631871a7eBBaD631b5f424909f0c77',
    wrappedNative: '0x4200000000000000000000000000000000000006',
  },
}

/**
 * Get Aave contract addresses for a chain
 */
export function getAaveAddresses(chainId: SupportedChainId): AaveAddresses {
  const addresses = AAVE_ADDRESSES[chainId]
  if (!addresses) {
    throw new Error(`Aave not supported on chain ${chainId}`)
  }
  return addresses
}

/**
 * Get supported chain IDs for Aave
 */
export function getSupportedChainIds(): SupportedChainId[] {
  return Object.keys(AAVE_ADDRESSES).map(Number) as SupportedChainId[]
}
```

---

## Namespace Implementation

### BaseBorrowNamespace

```typescript
// packages/sdk/src/borrow/namespaces/BaseBorrowNamespace.ts

import type { Address } from 'viem'

import type { BorrowProvider } from '@/borrow/core/BorrowProvider.js'
import type { BorrowProviderConfig } from '@/types/borrow/base.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  BorrowRateParams,
  BorrowRate,
  BorrowRateWithProvider,
  BorrowPositionsParams,
  BorrowPosition,
  GetBorrowMarketParams,
  GetBorrowMarketsParams,
  BorrowMarket,
} from '@/types/borrow/base.js'

/**
 * Borrow providers registry
 */
export type BorrowProviders = {
  aave?: BorrowProvider<BorrowProviderConfig>
  compound?: BorrowProvider<BorrowProviderConfig>
}

/**
 * Base borrow namespace with shared read-only operations
 * @description Aggregates operations across all configured borrow providers.
 */
export abstract class BaseBorrowNamespace {
  constructor(protected readonly providers: BorrowProviders) {}

  /**
   * Get borrow rate from first available provider
   */
  async rate(params: BorrowRateParams): Promise<BorrowRate> {
    const provider = this.getProviderForChain(params.chainId)
    return provider.getRate(params)
  }

  /**
   * Get borrow rates from ALL providers for comparison
   * @returns Array of rates with provider attribution, sorted by lowest rate
   */
  async rates(params: BorrowRateParams): Promise<BorrowRateWithProvider[]> {
    const providers = this.getProvidersForChain(params.chainId)
    const results = await Promise.allSettled(
      providers.map(async ({ name, provider }) => ({
        ...await provider.getRate(params),
        provider: name,
      }))
    )
    return results
      .filter((r): r is PromiseFulfilledResult<BorrowRateWithProvider> =>
        r.status === 'fulfilled'
      )
      .map(r => r.value)
      .sort((a, b) => a.variableRate - b.variableRate)
  }

  /**
   * Get a specific borrow market
   */
  async getMarket(params: GetBorrowMarketParams): Promise<BorrowMarket> {
    const provider = this.getProviderForChain(params.chainId)
    return provider.getMarket(params)
  }

  /**
   * Get available borrow markets across all providers
   */
  async getMarkets(params: GetBorrowMarketsParams = {}): Promise<BorrowMarket[]> {
    const results = await Promise.all(
      this.getAllProviders().map((p) => p.getMarkets(params))
    )
    return results.flat()
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

  protected getAllProviders(): BorrowProvider<BorrowProviderConfig>[] {
    return Object.values(this.providers).filter(
      (p): p is BorrowProvider<BorrowProviderConfig> => p !== undefined
    )
  }

  protected getProvidersForChain(
    chainId: SupportedChainId
  ): Array<{ name: string; provider: BorrowProvider<BorrowProviderConfig> }> {
    return Object.entries(this.providers)
      .filter(([_, p]) => p !== undefined && p.isChainSupported(chainId))
      .map(([name, provider]) => ({
        name,
        provider: provider as BorrowProvider<BorrowProviderConfig>
      }))
  }

  protected getProviderForChain(
    chainId: SupportedChainId
  ): BorrowProvider<BorrowProviderConfig> {
    for (const provider of this.getAllProviders()) {
      if (provider.isChainSupported(chainId)) {
        return provider
      }
    }
    throw new Error(`No borrow provider available for chain ${chainId}`)
  }
}
```

### ActionsBorrowNamespace

```typescript
// packages/sdk/src/borrow/namespaces/ActionsBorrowNamespace.ts

import type { Address } from 'viem'

import { BaseBorrowNamespace } from './BaseBorrowNamespace.js'
import type { BorrowPositionsParams, BorrowPosition } from '@/types/borrow/base.js'

/**
 * Actions borrow namespace (read-only, no wallet required for market queries)
 * @description Provides rate(), getMarket(), and getMarkets() for read-only access.
 * Also supports positions() when a wallet address is provided externally.
 */
export class ActionsBorrowNamespace extends BaseBorrowNamespace {
  /**
   * Get borrow positions for a specific address
   * @description Unlike wallet.borrow.positions(), requires explicit wallet address
   */
  async positions(
    params: BorrowPositionsParams & { walletAddress: Address }
  ): Promise<BorrowPosition[]> {
    const results = await Promise.all(
      this.getAllProviders().map((p) => p.getPositions(params))
    )
    return results.flat()
  }
}
```

### WalletBorrowNamespace

```typescript
// packages/sdk/src/borrow/namespaces/WalletBorrowNamespace.ts

import type { Address } from 'viem'

import { BaseBorrowNamespace, type BorrowProviders } from './BaseBorrowNamespace.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  BorrowExecuteParams,
  BorrowReceipt,
  BorrowRepayParams,
  BorrowRepayReceipt,
  BorrowPositionsParams,
  BorrowPosition,
  BorrowTransaction,
  RepayTransaction,
} from '@/types/borrow/base.js'

/**
 * Wallet borrow namespace (full operations with signing)
 * @description Provides execute(), repay(), and positions() for borrow operations
 */
export class WalletBorrowNamespace extends BaseBorrowNamespace {
  constructor(
    providers: BorrowProviders,
    private readonly wallet: Wallet
  ) {
    super(providers)
  }

  /**
   * Execute a borrow against collateral
   */
  async execute(params: BorrowExecuteParams): Promise<BorrowReceipt> {
    const provider = this.getProviderForChain(params.chainId)

    const borrowTx = await provider.execute({
      ...params,
      walletAddress: this.wallet.address,
    })

    const receipt = await this.executeTransaction(borrowTx, params.chainId)

    return {
      receipt,
      amount: borrowTx.amount,
      amountFormatted: this.formatAmount(borrowTx.amount, params.asset),
      asset: borrowTx.asset,
      collateralAsset: borrowTx.collateralAsset,
      rateMode: borrowTx.rateMode,
      borrowRate: borrowTx.borrowRate,
      healthFactor: borrowTx.healthFactor,
    }
  }

  /**
   * Repay a borrow position
   */
  async repay(params: BorrowRepayParams): Promise<BorrowRepayReceipt> {
    const provider = this.getProviderForChain(params.chainId)

    const repayTx = await provider.repay({
      ...params,
      walletAddress: this.wallet.address,
    })

    const receipt = await this.executeTransaction(repayTx, params.chainId)

    return {
      receipt,
      amount: repayTx.amount,
      amountFormatted: this.formatAmount(repayTx.amount, params.asset),
      asset: params.asset,
      remainingDebt: repayTx.remainingDebt,
      remainingDebtFormatted: this.formatAmount(repayTx.remainingDebt, params.asset),
      healthFactor: repayTx.healthFactor,
    }
  }

  /**
   * Get borrow positions for the connected wallet
   */
  async positions(params: BorrowPositionsParams): Promise<BorrowPosition[]> {
    const results = await Promise.all(
      this.getAllProviders().map((p) =>
        p.getPositions({ ...params, walletAddress: this.wallet.address })
      )
    )
    return results.flat()
  }

  /**
   * Execute borrow/repay transaction with approval batching
   */
  private async executeTransaction(
    tx: BorrowTransaction | RepayTransaction,
    chainId: SupportedChainId
  ): Promise<BorrowReceipt['receipt']> {
    const { transactionData } = tx
    const txs = []

    if (transactionData.approval) {
      txs.push(transactionData.approval)
    }

    txs.push(transactionData.transaction)

    if (txs.length > 1) {
      return this.wallet.sendBatch(txs, chainId)
    }
    return this.wallet.send(transactionData.transaction, chainId)
  }

  private formatAmount(amount: bigint, asset: { metadata: { decimals: number } }): string {
    return (Number(amount) / 10 ** asset.metadata.decimals).toString()
  }
}
```

---

## Actions Class Integration

```typescript
// packages/sdk/src/actions.ts (additions)

import type { BorrowConfig } from '@/types/actions.js'
import { AaveBorrowProvider } from '@/borrow/providers/aave/AaveBorrowProvider.js'
import { ActionsBorrowNamespace } from '@/borrow/namespaces/ActionsBorrowNamespace.js'
import type { BorrowProviders } from '@/borrow/namespaces/BaseBorrowNamespace.js'

export class Actions {
  // ... existing code ...

  private _borrowProviders: BorrowProviders = {}
  private _borrow?: ActionsBorrowNamespace

  constructor(config: ActionsConfig, deps: { hostedWalletProviderRegistry }) {
    // ... existing initialization ...

    // Initialize borrow providers
    if (config.borrow?.aave) {
      this._borrowProviders.aave = new AaveBorrowProvider(
        config.borrow.aave,
        this.chainManager
      )
    }

    // Create borrow namespace if any providers configured
    if (Object.keys(this._borrowProviders).length > 0) {
      this._borrow = new ActionsBorrowNamespace(this._borrowProviders)
    }

    // ... pass to wallet provider ...
  }

  /**
   * Borrow namespace for market queries (read-only)
   */
  get borrow(): ActionsBorrowNamespace {
    if (!this._borrow) {
      throw new Error(
        'Borrow not configured. Add borrow config to ActionsConfig.'
      )
    }
    return this._borrow
  }

  /** Borrow providers for wallet creation */
  get borrowProviders(): BorrowProviders {
    return this._borrowProviders
  }
}
```

---

## Wallet Class Integration

```typescript
// packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts (additions)

import { WalletBorrowNamespace } from '@/borrow/namespaces/WalletBorrowNamespace.js'
import type { BorrowProviders } from '@/borrow/namespaces/BaseBorrowNamespace.js'

export abstract class Wallet {
  // ... existing code ...

  borrow?: WalletBorrowNamespace
  protected borrowProviders: { aave?; compound? }

  constructor(
    chainManager: ChainManager,
    lendProviders?: { ... },
    swapProviders?: { ... },
    borrowProviders?: BorrowProviders,
    supportedAssets?: Asset[],
  ) {
    // ... existing code ...

    // Initialize borrow namespace
    if (borrowProviders && Object.keys(borrowProviders).length > 0) {
      this.borrow = new WalletBorrowNamespace(borrowProviders, this)
    }
  }
}
```

---

## Demo Backend Integration

### Borrow Service

```typescript
// packages/demo/backend/src/services/borrow.ts

import type { SmartWallet } from '@eth-optimism/actions-sdk'
import type {
  BorrowExecuteParams,
  BorrowRepayParams,
  BorrowReceipt,
  BorrowRepayReceipt,
  BorrowRate,
  BorrowPosition,
  BorrowMarket,
} from '@eth-optimism/actions-sdk'

import { actions } from '@/config/actions.js'
import { getWallet } from '@/services/wallet.js'
import { SUPPORTED_CHAIN_ID } from '@/config/chains.js'
import { getBlockExplorerUrl } from '@/utils/explorer.js'

/**
 * Execute a borrow
 */
export async function executeBorrow(
  idToken: string,
  params: BorrowExecuteParams
): Promise<BorrowReceipt & { explorerUrl?: string }> {
  const wallet = await getWallet(idToken)

  if (!wallet.borrow) {
    throw new Error('Borrow not configured for this wallet')
  }

  const receipt = await wallet.borrow.execute({
    ...params,
    chainId: SUPPORTED_CHAIN_ID,
  })

  const txHash = 'userOpHash' in receipt.receipt
    ? receipt.receipt.receipt.transactionHash
    : receipt.receipt.transactionHash

  return {
    ...receipt,
    explorerUrl: getBlockExplorerUrl(txHash, SUPPORTED_CHAIN_ID),
  }
}

/**
 * Repay a borrow position
 */
export async function repayBorrow(
  idToken: string,
  params: BorrowRepayParams
): Promise<BorrowRepayReceipt & { explorerUrl?: string }> {
  const wallet = await getWallet(idToken)

  if (!wallet.borrow) {
    throw new Error('Borrow not configured for this wallet')
  }

  const receipt = await wallet.borrow.repay({
    ...params,
    chainId: SUPPORTED_CHAIN_ID,
  })

  const txHash = 'userOpHash' in receipt.receipt
    ? receipt.receipt.receipt.transactionHash
    : receipt.receipt.transactionHash

  return {
    ...receipt,
    explorerUrl: getBlockExplorerUrl(txHash, SUPPORTED_CHAIN_ID),
  }
}

/**
 * Get borrow positions for a wallet
 */
export async function getBorrowPositions(
  idToken: string
): Promise<BorrowPosition[]> {
  const wallet = await getWallet(idToken)

  if (!wallet.borrow) {
    throw new Error('Borrow not configured for this wallet')
  }

  return wallet.borrow.positions({ chainId: SUPPORTED_CHAIN_ID })
}

/**
 * Get borrow rates (no auth required)
 */
export async function getBorrowRates(
  assetSymbol: string
): Promise<BorrowRate[]> {
  const asset = actions.getSupportedAssets().find(
    (a) => a.metadata.symbol === assetSymbol
  )

  if (!asset) throw new Error(`Asset ${assetSymbol} not found`)

  return actions.borrow.rates({
    asset,
    chainId: SUPPORTED_CHAIN_ID,
  })
}

/**
 * Get borrow markets (no auth required)
 */
export async function getBorrowMarkets(): Promise<BorrowMarket[]> {
  return actions.borrow.getMarkets({ chainId: SUPPORTED_CHAIN_ID })
}
```

### Borrow Controller

```typescript
// packages/demo/backend/src/controllers/borrow.ts

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

import {
  executeBorrow,
  repayBorrow,
  getBorrowPositions,
  getBorrowRates,
  getBorrowMarkets,
} from '@/services/borrow.js'
import { authMiddleware } from '@/middleware/auth.js'
import { SUPPORTED_TOKENS } from '@/config/assets.js'

const borrowRouter = new Hono()

const executeBorrowSchema = z.object({
  assetSymbol: z.string(),
  amount: z.number().positive(),
  collateralAssetSymbol: z.string(),
  rateMode: z.enum(['variable', 'stable']).optional(),
})

const repaySchema = z.object({
  assetSymbol: z.string(),
  amount: z.union([z.number().positive(), z.literal('max')]),
  rateMode: z.enum(['variable', 'stable']).optional(),
})

// Execute borrow
borrowRouter.post(
  '/execute',
  authMiddleware,
  zValidator('json', executeBorrowSchema),
  async (c) => {
    const idToken = c.get('idToken')
    const body = c.req.valid('json')

    const asset = SUPPORTED_TOKENS.find(
      (t) => t.metadata.symbol === body.assetSymbol
    )
    const collateralAsset = SUPPORTED_TOKENS.find(
      (t) => t.metadata.symbol === body.collateralAssetSymbol
    )

    if (!asset || !collateralAsset) {
      return c.json({ error: 'Invalid asset symbol' }, 400)
    }

    const receipt = await executeBorrow(idToken, {
      asset,
      amount: body.amount,
      collateralAsset,
      rateMode: body.rateMode,
    })

    return c.json({
      ...receipt,
      amount: receipt.amount.toString(),
    })
  }
)

// Repay borrow
borrowRouter.post(
  '/repay',
  authMiddleware,
  zValidator('json', repaySchema),
  async (c) => {
    const idToken = c.get('idToken')
    const body = c.req.valid('json')

    const asset = SUPPORTED_TOKENS.find(
      (t) => t.metadata.symbol === body.assetSymbol
    )

    if (!asset) {
      return c.json({ error: 'Invalid asset symbol' }, 400)
    }

    const receipt = await repayBorrow(idToken, {
      asset,
      amount: body.amount,
      rateMode: body.rateMode,
    })

    return c.json({
      ...receipt,
      amount: receipt.amount.toString(),
      remainingDebt: receipt.remainingDebt.toString(),
    })
  }
)

// Get borrow positions
borrowRouter.get(
  '/positions',
  authMiddleware,
  async (c) => {
    const idToken = c.get('idToken')
    const positions = await getBorrowPositions(idToken)

    return c.json(positions.map((p) => ({
      ...p,
      debt: p.debt.toString(),
      collateralValue: p.collateralValue.toString(),
    })))
  }
)

// Get borrow rates
borrowRouter.get(
  '/rates',
  zValidator('query', z.object({ assetSymbol: z.string() })),
  async (c) => {
    const { assetSymbol } = c.req.valid('query')
    const rates = await getBorrowRates(assetSymbol)

    return c.json(rates.map((r) => ({
      ...r,
      availableLiquidity: r.availableLiquidity.toString(),
    })))
  }
)

// Get borrow markets
borrowRouter.get('/markets', async (c) => {
  const markets = await getBorrowMarkets()

  return c.json(markets.map((m) => ({
    ...m,
    availableLiquidity: m.availableLiquidity.toString(),
    totalBorrowed: m.totalBorrowed.toString(),
  })))
})

export { borrowRouter }
```

### Backend Config Updates

```typescript
// packages/demo/backend/src/config/actions.ts (additions)

export const actions = createActions({
  // ... existing config ...

  borrow: {
    aave: {
      minHealthFactor: 1.2,  // Safety margin
    },
  },
})
```

---

## Demo Frontend Integration

### Borrow Form Component

```typescript
// packages/demo/frontend/src/components/BorrowForm.tsx

import { useState, useEffect } from 'react'
import { useBorrowRates, useBorrowExecute, useBorrowPositions } from '@/hooks/useBorrow'
import { SUPPORTED_TOKENS } from '@/config/assets'

export function BorrowForm() {
  const [borrowAsset, setBorrowAsset] = useState(SUPPORTED_TOKENS[0])
  const [collateralAsset, setCollateralAsset] = useState(SUPPORTED_TOKENS[1])
  const [amount, setAmount] = useState<string>('')
  const [activeView, setActiveView] = useState<'borrow' | 'repay' | 'positions'>('borrow')

  const { data: rates, isLoading: isRatesLoading } = useBorrowRates({
    assetSymbol: borrowAsset.metadata.symbol,
  })

  const { data: positions } = useBorrowPositions()

  const { mutate: executeBorrow, isPending: isBorrowing } = useBorrowExecute()

  const handleBorrow = () => {
    if (!amount) return
    executeBorrow({
      assetSymbol: borrowAsset.metadata.symbol,
      amount: parseFloat(amount),
      collateralAssetSymbol: collateralAsset.metadata.symbol,
    })
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4 font-mono">
      {/* View tabs */}
      <div className="flex gap-2 mb-4">
        {(['borrow', 'repay', 'positions'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`
              px-3 py-1 rounded text-sm capitalize
              ${activeView === view
                ? 'bg-green-500 text-black'
                : 'bg-gray-800 text-green-400 hover:bg-gray-700'
              }
            `}
          >
            {view}
          </button>
        ))}
      </div>

      {activeView === 'borrow' && (
        <>
          {/* Amount input */}
          <div className="mb-4">
            <label className="text-green-400 text-sm">Borrow amount</label>
            <div className="flex gap-2 mt-1">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className="flex-1 bg-gray-800 text-white p-2 rounded border border-gray-700"
              />
              <select
                value={borrowAsset.metadata.symbol}
                onChange={(e) => {
                  const token = SUPPORTED_TOKENS.find(t => t.metadata.symbol === e.target.value)
                  if (token) setBorrowAsset(token)
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

          {/* Collateral selector */}
          <div className="mb-4">
            <label className="text-green-400 text-sm">Collateral</label>
            <select
              value={collateralAsset.metadata.symbol}
              onChange={(e) => {
                const token = SUPPORTED_TOKENS.find(t => t.metadata.symbol === e.target.value)
                if (token) setCollateralAsset(token)
              }}
              className="w-full bg-gray-800 text-white p-2 rounded border border-gray-700 mt-1"
            >
              {SUPPORTED_TOKENS.filter(t => t.metadata.symbol !== borrowAsset.metadata.symbol).map((token) => (
                <option key={token.metadata.symbol} value={token.metadata.symbol}>
                  {token.metadata.symbol}
                </option>
              ))}
            </select>
          </div>

          {/* Rate info */}
          {rates && rates[0] && (
            <div className="bg-gray-800 rounded p-3 mb-4 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Borrow APR</span>
                <span className="text-white">
                  {(rates[0].variableRate * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between text-gray-400 mt-1">
                <span>Available</span>
                <span className="text-white">
                  {rates[0].availableLiquidityFormatted} {borrowAsset.metadata.symbol}
                </span>
              </div>
              <div className="flex justify-between text-gray-400 mt-1">
                <span>Utilization</span>
                <span className="text-white">
                  {(rates[0].utilizationRate * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          {/* Borrow button */}
          <button
            onClick={handleBorrow}
            disabled={!amount || isBorrowing}
            className={`
              w-full py-3 rounded font-bold transition-colors
              ${!amount || isBorrowing
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-green-500 text-black hover:bg-green-400'
              }
            `}
          >
            {isBorrowing ? 'Borrowing...' : 'Borrow'}
          </button>
        </>
      )}

      {activeView === 'positions' && positions && (
        <div className="space-y-3">
          {positions.length === 0 && (
            <p className="text-gray-500 text-sm">No active borrow positions</p>
          )}
          {positions.map((pos, i) => (
            <div key={i} className="bg-gray-800 rounded p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-green-400">{pos.asset.metadata.symbol}</span>
                <span className="text-white">{pos.debtFormatted}</span>
              </div>
              <div className="flex justify-between text-gray-400 mt-1">
                <span>Rate</span>
                <span>{(pos.borrowRate * 100).toFixed(2)}% ({pos.rateMode})</span>
              </div>
              <div className="flex justify-between text-gray-400 mt-1">
                <span>Health Factor</span>
                <span className={
                  pos.healthFactor < 1.1 ? 'text-red-400' :
                  pos.healthFactor < 1.5 ? 'text-yellow-400' : 'text-green-400'
                }>
                  {pos.healthFactor.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-gray-400 mt-1">
                <span>LTV</span>
                <span>{(pos.ltv * 100).toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Borrow Hooks

```typescript
// packages/demo/frontend/src/hooks/useBorrow.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { actionsApi } from '@/api/actionsApi'

export function useBorrowRates(params: { assetSymbol: string }) {
  return useQuery({
    queryKey: ['borrowRates', params.assetSymbol],
    queryFn: () => actionsApi.getBorrowRates(params.assetSymbol),
    staleTime: 30_000,
  })
}

export function useBorrowPositions() {
  return useQuery({
    queryKey: ['borrowPositions'],
    queryFn: () => actionsApi.getBorrowPositions(),
    staleTime: 15_000,
  })
}

export function useBorrowExecute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: {
      assetSymbol: string
      amount: number
      collateralAssetSymbol: string
      rateMode?: 'variable' | 'stable'
    }) => actionsApi.executeBorrow(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['borrowPositions'] })
      queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
    },
  })
}

export function useBorrowRepay() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: {
      assetSymbol: string
      amount: number | 'max'
      rateMode?: 'variable' | 'stable'
    }) => actionsApi.repayBorrow(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['borrowPositions'] })
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

  async getBorrowRates(assetSymbol: string) {
    const response = await fetch(`${API_BASE}/borrow/rates?assetSymbol=${assetSymbol}`)
    return response.json()
  },

  async getBorrowPositions() {
    const response = await fetch(`${API_BASE}/borrow/positions`, {
      headers: { Authorization: `Bearer ${getIdToken()}` },
    })
    return response.json()
  },

  async getBorrowMarkets() {
    const response = await fetch(`${API_BASE}/borrow/markets`)
    return response.json()
  },

  async executeBorrow(params: {
    assetSymbol: string
    amount: number
    collateralAssetSymbol: string
    rateMode?: 'variable' | 'stable'
  }) {
    const response = await fetch(`${API_BASE}/borrow/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getIdToken()}`,
      },
      body: JSON.stringify(params),
    })
    return response.json()
  },

  async repayBorrow(params: {
    assetSymbol: string
    amount: number | 'max'
    rateMode?: 'variable' | 'stable'
  }) {
    const response = await fetch(`${API_BASE}/borrow/repay`, {
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

#### BorrowProvider Base Class Tests

```typescript
// packages/sdk/src/borrow/core/__tests__/BorrowProvider.test.ts

describe('BorrowProvider', () => {
  describe('execute()', () => {
    it('should throw if chain not supported')
    it('should throw if asset not supported on chain')
    it('should throw if collateral not supported on chain')
    it('should throw if asset is blocklisted')
    it('should throw if collateral is blocklisted')
    it('should throw if asset not in allowlist (when configured)')
    it('should throw if collateral not in allowlist (when configured)')
    it('should convert human-readable amount to wei')
    it('should use default rate mode (variable) when not specified')
    it('should throw if health factor would drop below minimum')
    it('should throw if LTV would exceed max (when configured)')
    it('should call _execute with correct internal params')
  })

  describe('repay()', () => {
    it('should throw if chain not supported')
    it('should throw if asset not supported on chain')
    it('should convert human-readable amount to wei')
    it('should use uint256 max for full repay')
    it('should call _repay with correct internal params')
  })

  describe('getPositions()', () => {
    it('should throw if chain not supported')
    it('should call _getPositions with params')
  })

  describe('getRate()', () => {
    it('should throw if chain not supported')
    it('should call _getRate with params')
  })

  describe('validateCollateralAllowed()', () => {
    it('should allow any collateral when no allowlist configured')
    it('should allow collateral in allowlist')
    it('should reject collateral not in allowlist')
    it('should reject blocklisted collateral')
  })

  describe('validateAssetAllowed()', () => {
    it('should allow any asset when no allowlist configured')
    it('should allow assets in allowlist')
    it('should reject assets not in allowlist')
    it('should reject blocklisted assets')
  })
})
```

#### AaveBorrowProvider Tests

```typescript
// packages/sdk/src/borrow/providers/aave/__tests__/AaveBorrowProvider.test.ts

describe('AaveBorrowProvider', () => {
  describe('_execute()', () => {
    it('should build correct borrow transaction for variable rate')
    it('should build correct borrow transaction for stable rate')
    it('should use correct Aave pool address for chain')
    it('should estimate post-borrow health factor')
    it('should return current borrow rate')
  })

  describe('_repay()', () => {
    it('should build correct repay transaction')
    it('should build correct max repay transaction')
    it('should include token approval when needed')
    it('should skip approval when allowance sufficient')
    it('should return remaining debt')
  })

  describe('_getPositions()', () => {
    it('should return all active borrow positions')
    it('should include variable and stable positions separately')
    it('should filter by asset when specified')
    it('should return health factor and LTV')
  })

  describe('_getRate()', () => {
    it('should return variable and stable rates')
    it('should return available liquidity')
    it('should calculate utilization rate')
  })

  describe('_getMarkets()', () => {
    it('should return all borrowable markets')
    it('should filter non-borrowable reserves')
    it('should include collateral configuration')
  })

  describe('supportedChainIds()', () => {
    it('should return chains with Aave V3 deployed')
  })
})
```

#### Namespace Tests

```typescript
// packages/sdk/src/borrow/namespaces/__tests__/WalletBorrowNamespace.test.ts

describe('WalletBorrowNamespace', () => {
  describe('execute()', () => {
    it('should route to correct provider for chain')
    it('should pass wallet address to provider')
    it('should call wallet.send() for single transaction')
    it('should call wallet.sendBatch() for approval + borrow')
    it('should return receipt with health factor')
  })

  describe('repay()', () => {
    it('should route to correct provider')
    it('should handle max repay')
    it('should batch approval + repay transactions')
    it('should return remaining debt')
  })

  describe('positions()', () => {
    it('should aggregate positions from all providers')
    it('should use connected wallet address')
  })

  describe('rates()', () => {
    it('should aggregate rates from all providers')
    it('should sort by lowest variable rate')
  })
})
```

### Backend Tests (Medium Priority)

```typescript
// packages/demo/backend/src/services/__tests__/borrow.test.ts

describe('BorrowService', () => {
  describe('executeBorrow()', () => {
    it('should execute borrow for authenticated user')
    it('should return explorer URL in receipt')
    it('should throw if borrow not configured')
  })

  describe('repayBorrow()', () => {
    it('should repay borrow for authenticated user')
    it('should handle max repay')
  })

  describe('getBorrowPositions()', () => {
    it('should return positions for authenticated user')
  })

  describe('getBorrowRates()', () => {
    it('should return rates for asset')
  })
})
```

### Frontend Tests (Minimal Priority)

```typescript
// packages/demo/frontend/src/components/__tests__/BorrowForm.test.tsx

describe('BorrowForm', () => {
  it('should render borrow form')
  it('should fetch rates on asset change')
  it('should display health factor warning')
  it('should execute borrow on button click')
  it('should show positions list')
})
```

---

## Acceptance Criteria

### SDK

- [ ] `BorrowProvider` abstract class implemented with validation logic
- [ ] `AaveBorrowProvider` implemented with Aave V3 Pool integration
- [ ] Health factor monitoring and safety guardrails working
- [ ] LTV cap enforcement working
- [ ] `ActionsBorrowNamespace` provides `rates()`, `getMarkets()`, `positions()` methods
- [ ] `WalletBorrowNamespace` provides `execute()`, `repay()`, and `positions()` methods
- [ ] Transaction batching works for approval + repay
- [ ] Both variable and stable rate modes supported
- [ ] Full repay (`amount: 'max'`) works correctly
- [ ] Collateral allowlist/blocklist validation works
- [ ] Asset allowlist/blocklist validation works
- [ ] Multi-provider aggregation works for rates and markets
- [ ] All SDK tests passing

### Backend

- [ ] `/borrow/execute` endpoint executes borrows
- [ ] `/borrow/repay` endpoint repays borrows
- [ ] `/borrow/positions` endpoint returns positions
- [ ] `/borrow/rates` endpoint returns rates
- [ ] `/borrow/markets` endpoint returns markets
- [ ] Authentication required for execute, repay, and positions
- [ ] Borrow config added to actions initialization
- [ ] Explorer URLs included in receipts

### Frontend

- [ ] Borrow tab enabled (no longer "Coming Soon")
- [ ] Borrow form with asset and collateral selection
- [ ] Repay form with partial and full repay support
- [ ] Positions list with health factor display
- [ ] Health factor color coding (green/yellow/red)
- [ ] Rate and market info display
- [ ] Loading states during operations
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

No new packages required - Aave V3 integration is via direct contract calls using viem (same pattern as existing providers).

### Error Handling

- Validate inputs early with descriptive error messages
- Health factor checks prevent dangerous borrows
- LTV cap prevents over-leveraging
- Wrap SDK errors with context
- Log errors in services, return clean messages to API

### Relationship with LendProvider

Borrowing is the complement to lending. The typical workflow is:

1. **Supply collateral** via `wallet.lend.supply()` (LendProvider)
2. **Enable collateral** on the protocol (may be automatic in Aave V3)
3. **Borrow against collateral** via `wallet.borrow.execute()` (BorrowProvider)
4. **Monitor health factor** via `wallet.borrow.positions()`
5. **Repay debt** via `wallet.borrow.repay()` (BorrowProvider)
6. **Withdraw collateral** via `wallet.lend.withdraw()` (LendProvider)

Both providers share the same `ChainManager` and asset configuration for consistency.

### Future Considerations

- Flash loans
- Leverage positions (supply + borrow in single transaction)
- Interest rate switching (variable ↔ stable)
- Liquidation monitoring and alerts
- Collateral swap (change collateral type without repaying)
- E-mode support for correlated asset pairs

---

## References

- [Aave V3 Documentation](https://docs.aave.com/developers/core-contracts/pool)
- [Aave V3 Deployments](https://docs.aave.com/developers/deployed-contracts)
- [Aave V3 Risk Parameters](https://docs.aave.com/risk/asset-risk/risk-parameters)
- Provider pattern from existing LendProvider and SwapProvider implementations
