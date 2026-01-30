import type { Address } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type { TransactionData } from '@/types/transaction.js'
import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

export { SwapProvider } from '@/swap/core/SwapProvider.js'
export { ActionsSwapNamespace } from '@/swap/namespaces/ActionsSwapNamespace.js'
export { WalletSwapNamespace } from '@/swap/namespaces/WalletSwapNamespace.js'

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
 * Swap pair configuration
 * @description Define allowed/blocked trading pairs by assets
 */
export interface SwapPairConfig {
  /** Token pair - order doesn't matter for allowlist/blocklist */
  assets: [Asset, Asset]
  /** Chain ID where this pair is allowed/blocked */
  chainId: SupportedChainId
}

/**
 * Swap market identifier
 * @description Unique identifier for a swap market (mirrors LendMarketId pattern)
 */
export type SwapMarketId = {
  /** Pool identifier (keccak256 hash of PoolKey) */
  poolId: string
  /** Chain ID where this market exists */
  chainId: SupportedChainId
}

/**
 * Parameters for getting a specific swap market
 */
export type GetSwapMarketParams = SwapMarketId

/**
 * Parameters for getting swap markets
 */
export interface GetSwapMarketsParams {
  /** Filter by chain ID */
  chainId?: SupportedChainId
  /** Filter by asset (returns markets containing this asset) */
  asset?: Asset
}

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
  /** Chain to execute swap on */
  chainId: SupportedChainId
  /** Slippage tolerance override (e.g., 0.01 for 1%). Overrides provider and config defaults. */
  slippage?: number
  /** Transaction deadline as Unix timestamp. Defaults to now + 1 minute. */
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
 * Market information for a swap hop
 */
export interface SwapMarketInfo {
  /** Market address or identifier */
  address: Address
  /** Fee tier in pips */
  fee: number
  /** Protocol version used (v2, v3, v4) */
  version: 'v2' | 'v3' | 'v4'
}

/**
 * Swap route information
 */
export interface SwapRoute {
  /** Ordered list of assets in the route path */
  path: Asset[]
  /** Market information for each hop */
  pools: SwapMarketInfo[]
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

/**
 * Swap market information
 */
export interface SwapMarket {
  /** Market identifier (contains poolId and chainId) */
  marketId: SwapMarketId
  /** Token pair in the market */
  assets: [Asset, Asset]
  /** Fee tier in pips (500 = 0.05%) */
  fee: number
  /** Total value locked in USD */
  tvl?: bigint
  /** 24-hour trading volume in USD */
  volume24h?: bigint
  /** Provider name */
  provider: 'uniswap'
}

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
   * Provider implementation of getMarket method
   */
  _getMarket(params: GetSwapMarketParams): Promise<SwapMarket>

  /**
   * Provider implementation of getMarkets method
   */
  _getMarkets(params: GetSwapMarketsParams): Promise<SwapMarket[]>

  /**
   * Check if provider supports the given chain
   */
  _isChainSupported(chainId: SupportedChainId): boolean
}
