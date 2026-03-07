import type { Address } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { SwapProvider } from '@/swap/core/SwapProvider.js'
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
 * Map of available swap providers keyed by provider name
 */
export type SwapProviders = {
  uniswap?: SwapProvider<SwapProviderConfig>
}

/**
 * Swap provider configuration
 * @description Configuration for a single swap provider (mirrors LendProviderConfig pattern)
 */
export interface SwapProviderConfig {
  /** Default slippage tolerance (e.g., 0.005 for 0.5%) */
  defaultSlippage?: number
  /** Allowlist of swap markets (optional - defaults to all supported assets) */
  marketAllowlist?: SwapMarketFilter[]
  /** Blocklist of swap markets to exclude */
  marketBlocklist?: SwapMarketFilter[]
}

/**
 * Swap market filter
 * @description Define allowed/blocked trading markets by assets.
 * 2 assets = one explicit pair. 3+ = all pairs between them.
 */
export interface SwapMarketFilter {
  /** 2 assets = one explicit pair. 3+ = all pairs between them. */
  assets: [Asset, Asset, ...Asset[]]
  /** Restrict to a specific chain. Omit = all configured chains. */
  chainId?: SupportedChainId
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
 * @description Exactly one of amountIn or amountOut must be provided.
 * Both values should be human-readable numbers (e.g., 100 for 100 USDC).
 */
export interface SwapExecuteParams {
  /** Amount of input token (human-readable). For exact-in swaps. Mutually exclusive with amountOut. */
  amountIn?: number
  /** Amount of output token (human-readable). For exact-out swaps. Mutually exclusive with amountIn. */
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
 * Fully resolved swap parameters with defaults applied and amounts in wei.
 * Passed to provider _execute() implementations.
 */
export interface ResolvedSwapParams {
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
 * @description Specify either amountIn (for exact-in) or amountOut (for exact-out),
 * not both. Amounts should be human-readable numbers (e.g., 100 for 100 USDC).
 */
export interface SwapPriceParams {
  /** Token to get price for (required) */
  assetIn: Asset
  /** Token to price against. Defaults to USDC if not provided. */
  assetOut?: Asset
  /** Amount of input token (human-readable). Defaults to 1 unit. For exact-in quotes. */
  amountIn?: number
  /** Amount of output token (human-readable). For exact-out quotes. */
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
  /** Human-readable input amount */
  amountIn: number
  /** Human-readable output amount */
  amountOut: number
  /** Input amount in wei */
  amountInWei: bigint
  /** Expected output amount in wei */
  amountOutWei: bigint
  /** Price impact as decimal (0.03 = 3%). Derived from pool mid-price vs execution price. */
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
  /** Human-readable input amount */
  amountIn: number
  /** Human-readable output amount */
  amountOut: number
  /** Input amount in wei */
  amountInWei: bigint
  /** Output amount in wei (expected) */
  amountOutWei: bigint
  /** Input asset */
  assetIn: Asset
  /** Output asset */
  assetOut: Asset
  /** Execution price */
  price: string
  /** Price impact as decimal (0.03 = 3%) */
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
  /** Human-readable input amount */
  amountIn: number
  /** Human-readable output amount */
  amountOut: number
  /** Actual input amount in wei */
  amountInWei: bigint
  /** Actual output amount in wei */
  amountOutWei: bigint
  /** Input asset */
  assetIn: Asset
  /** Output asset */
  assetOut: Asset
  /** Execution price as human-readable string */
  price: string
  /** Price impact as decimal (0.03 = 3%) */
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
  /** Provider name */
  provider: 'uniswap'
}
