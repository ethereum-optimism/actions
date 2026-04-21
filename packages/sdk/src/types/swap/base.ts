import type { Address, Hex } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { EnsName } from '@/services/nameservices/ens/types.js'
import type { SwapProviderName } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type { TransactionData } from '@/types/transaction.js'
import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

export { SwapProvider } from '@/actions/swap/core/SwapProvider.js'
export { ActionsSwapNamespace } from '@/actions/swap/namespaces/ActionsSwapNamespace.js'
export { WalletSwapNamespace } from '@/actions/swap/namespaces/WalletSwapNamespace.js'
export type { SwapProviders } from '@/types/providers.js'

/**
 * Per-provider swap configuration.
 * Provider-level values override the shared SwapGlobalConfig defaults.
 */
export interface SwapProviderConfig {
  /** Slippage tolerance override for this provider (e.g., 0.005 for 0.5%) */
  defaultSlippage?: number
  /** Maximum allowed slippage override for this provider (e.g., 0.5 for 50%) */
  maxSlippage?: number
  /** Quote expiration override for this provider, in seconds from now */
  quoteExpirationSeconds?: number
  /** Allowlist of swap markets (optional - defaults to all supported assets) */
  marketAllowlist?: SwapMarketConfig[]
  /** Blocklist of swap markets to exclude */
  marketBlocklist?: SwapMarketConfig[]
}

/**
 * Swap market filter
 * @description Define allowed/blocked trading markets by assets.
 * 2 assets = one explicit pair. 3+ = all pairs between them.
 */
export interface SwapMarketConfig {
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
 * Parameters for a wallet swap — what the developer passes.
 * Exactly one of amountIn or amountOut must be provided.
 */
export interface WalletSwapParams {
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
  /** Recipient address or ENS name (e.g. "vitalik.eth"). Defaults to wallet address. */
  recipient?: Address | EnsName
  /** Explicitly select a swap provider. Overrides routing config. */
  provider?: SwapProviderName
}

/**
 * Full swap execute parameters including wallet address.
 * walletAddress is auto-injected by the wallet namespace.
 */
export interface SwapExecuteParams extends WalletSwapParams {
  walletAddress: Address
}

/**
 * Fully resolved swap parameters with defaults applied and amounts as raw bigint.
 * Passed to provider _execute() implementations.
 */
export interface ResolvedSwapParams {
  amountInRaw?: bigint
  amountOutRaw?: bigint
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
  /** Explicitly select a swap provider. Overrides routing config. */
  provider?: SwapProviderName
}

/**
 * Parameters for getting a swap quote with pre-built execution data.
 */
export interface SwapQuoteParams {
  /** Token to sell */
  assetIn: Asset
  /** Token to buy (required) */
  assetOut: Asset
  /** Amount of input token (human-readable). Mutually exclusive with amountOut. */
  amountIn?: number
  /** Amount of output token (human-readable). Mutually exclusive with amountIn. */
  amountOut?: number
  /** Chain to execute swap on */
  chainId: SupportedChainId
  /** Slippage tolerance baked into the quote */
  slippage?: number
  /** Transaction deadline as Unix timestamp */
  deadline?: number
  /** Recipient address or ENS name (e.g. "vitalik.eth"). Defaults to wallet address. */
  recipient?: Address | EnsName
  /** Explicitly select a swap provider */
  provider?: SwapProviderName
}

/**
 * Pre-built execution data from a quote, ready to submit on-chain.
 */
export interface SwapQuoteExecution {
  /** Encoded swap calldata */
  swapCalldata: Hex
  /** Router/contract to send the swap transaction to */
  routerAddress: Address
  /** Native ETH value for ETH-in swaps, else 0n */
  value: bigint
  /** Opaque provider-specific context (e.g. stable flag, factory address) */
  providerContext?: Record<string, unknown>
}

/**
 * A complete swap quote: pricing, amounts, and pre-built execution data.
 * Pass to execute() to skip re-quoting.
 *
 * **Precision note:** `Raw` fields (bigint) are the on-chain source of truth.
 * Number fields (`amountIn`, `amountOut`, `price`, etc.) are display approximations
 * derived via `formatUnits` → `parseFloat`. For tokens with many significant digits,
 * numbers may lose precision. Use `Raw` fields for any math that matters.
 */
export interface SwapQuote {
  // ── What you're swapping ──
  /** Token being sold */
  assetIn: Asset
  /** Token being bought */
  assetOut: Asset
  /** Chain to execute on */
  chainId: SupportedChainId

  // ── Amounts (Raw = on-chain precision, number = display approximation) ──
  /** Human-readable input amount (display only — use amountInRaw for precision) */
  amountIn: number
  /** Input amount as raw bigint (native decimals). Source of truth. */
  amountInRaw: bigint
  /** Human-readable expected output (display only — use amountOutRaw for precision) */
  amountOut: number
  /** Expected output as raw bigint. Source of truth. */
  amountOutRaw: bigint
  /** Human-readable minimum output after slippage (display only) */
  amountOutMin: number
  /** Minimum output as raw bigint after slippage. Source of truth for on-chain execution. */
  amountOutMinRaw: bigint

  // ── Price (display approximations derived from number amounts) ──
  /** Exchange rate: amountOut / amountIn. Display approximation. */
  price: number
  /** Inverse exchange rate: amountIn / amountOut. Display approximation. */
  priceInverse: number
  /** Price impact as decimal (0.03 = 3%) */
  priceImpact: number

  // ── Route ──
  /** Route taken for the swap */
  route: SwapRoute

  // ── Execution ──
  /** Pre-built transaction data. Pass quote to execute() to use. */
  execution: SwapQuoteExecution

  // ── Metadata ──
  /** Provider that generated this quote */
  provider: SwapProviderName
  /** Slippage tolerance applied to this quote */
  slippage: number
  /** Transaction deadline (Unix seconds) */
  deadline: number
  /** When the quote was generated (Unix seconds) */
  quotedAt: number
  /** When the quote expires (Unix seconds) */
  expiresAt: number
  /** Estimated gas cost as raw bigint (native decimals) */
  gasEstimate?: bigint
  /**
   * Wallet address that will execute this quote.
   * Set by WalletSwapNamespace before execution — not available on price-only quotes.
   * Used to check existing on-chain allowances and skip redundant approvals.
   */
  recipient?: Address
  /**
   * The recipient address baked into execution.swapCalldata at quote time.
   * If recipient differs from quotedRecipient at execute time, calldata is re-encoded
   * with the correct recipient to prevent tokens from being sent to the wrong address.
   */
  quotedRecipient: Address
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
  /** Input amount as raw bigint (native decimals) */
  amountInRaw: bigint
  /** Expected output amount as raw bigint (native decimals) */
  amountOutRaw: bigint
  /** Price impact as decimal (0.03 = 3%). Derived from pool mid-price vs execution price. */
  priceImpact: number
  /** Route taken for the swap */
  route: SwapRoute
  /** Estimated gas cost as raw bigint (native decimals) */
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
  /** Input amount as raw bigint (native decimals) */
  amountInRaw: bigint
  /** Output amount as raw bigint (native decimals) (expected) */
  amountOutRaw: bigint
  /** Input asset */
  assetIn: Asset
  /** Output asset */
  assetOut: Asset
  /** Exchange rate: amountOut / amountIn */
  price: number
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
  /** Actual input amount as raw bigint (native decimals) */
  amountInRaw: bigint
  /** Actual output amount as raw bigint (native decimals) */
  amountOutRaw: bigint
  /** Input asset */
  assetIn: Asset
  /** Output asset */
  assetOut: Asset
  /** Exchange rate: amountOut / amountIn */
  price: number
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
  provider: SwapProviderName
}
