import type { Address, Hex } from 'viem'

import type { SupportedChainId } from '../constants/supportedChains.js'
import type { Asset } from './asset.js'

export { VerbsLendNamespace } from '../lend/namespaces/VerbsLendNamespace.js'
export { WalletLendNamespace } from '../lend/namespaces/WalletLendNamespace.js'
export { LendProvider } from '../lend/provider.js'

/**
 * Lending market identifier
 * @description Unique identifier for a lending market
 */
export type LendMarketId = {
  address: Address
  chainId: SupportedChainId
}

/**
 * Lending market metadata
 * @description Additional configuration properties for a lending market
 */
export type LendMarketMetadata = {
  /** Human-readable name for the market */
  name: string
  /** Asset information for this market */
  asset: Asset
  /** Lending provider type */
  lendProvider: 'morpho'
}

/**
 * Lending market configuration
 * @description Configuration for a lending market including asset information and provider
 */
export type LendMarketConfig = LendMarketId & LendMarketMetadata

/**
 * Parameters for getting a specific lending market
 * @description Requires market identifier (address and chainId)
 */
export type GetLendMarketParams = LendMarketId

/**
 * Transaction data for execution
 * @description Raw transaction data for wallet execution
 */
export interface TransactionData {
  /** Target contract address */
  to: Address
  /** Encoded function call data */
  data: Hex
  /** ETH value to send */
  value: bigint
}

/**
 * Lending transaction result
 * @description Result of a lending operation
 */
export interface LendTransaction {
  /** Transaction hash (set after execution) */
  hash?: string
  /** Amount lent */
  amount: bigint
  /** Asset address */
  asset: Address
  /** Market ID */
  marketId: string
  /** Estimated APY at time of lending */
  apy: number
  /** Transaction timestamp */
  timestamp: number
  /** Transaction data for execution (optional) */
  transactionData?: {
    /** Approval transaction (if needed) */
    approval?: TransactionData
    /** Main operation transaction (openPosition or closePosition) */
    openPosition?: TransactionData
    closePosition?: TransactionData
  }
  /** Slippage tolerance used */
  slippage?: number
}

/**
 * Lending market information
 * @description Basic information about a lending market
 */
export interface LendMarketBase {
  /** Market identifier */
  id: string
  /** Market name */
  name: string
  /** Loanable asset address */
  loanToken: Address
  /** Collateral asset address */
  collateralToken: Address
  /** Current supply APY */
  supplyApy: number
  /** Current utilization rate */
  utilization: number
  /** Available liquidity */
  liquidity: bigint
}

/**
 * Detailed lending market information
 * @description Comprehensive market data including rates and parameters
 */
export interface LendMarketInfo extends LendMarketBase {
  /** Oracle address */
  oracle: Address
  /** Interest rate model address */
  irm: Address
  /** Loan-to-value ratio */
  lltv: number
  /** Total supply */
  totalSupply: bigint
  /** Total borrow */
  totalBorrow: bigint
  /** Supply rate */
  supplyRate: bigint
  /** Borrow rate */
  borrowRate: bigint
  /** Last update timestamp */
  lastUpdate: number
}

/**
 * APY breakdown for detailed display
 * @description Breakdown of APY components following Morpho's official methodology
 */
export interface ApyBreakdown {
  /** Native APY from market lending (before fees) */
  nativeApy: number
  /** Total rewards APR from all sources */
  totalRewardsApr: number
  /** Individual token rewards APRs (dynamically populated) */
  usdc?: number
  morpho?: number
  other?: number
  /** Performance/management fee rate */
  performanceFee: number
  /** Net APY after all components and fees */
  netApy: number
}

/**
 * Lending market (vault) information
 * @description Information about a lending market (Morpho vault)
 */
export interface LendMarket {
  /** Chain ID */
  chainId: number
  /** Vault address */
  address: Address
  /** Vault name */
  name: string
  /** Asset token address */
  asset: Address
  /** Total assets under management */
  totalAssets: bigint
  /** Total shares issued */
  totalShares: bigint
  /** Current APY (net APY after rewards and fees) */
  apy: number
  /** Detailed APY breakdown */
  apyBreakdown: ApyBreakdown
  /** Vault owner address */
  owner: Address
  /** Vault curator address */
  curator: Address
  /** Fee percentage (in basis points) */
  fee: number
  /** Last update timestamp */
  lastUpdate: number
}

/**
 * Lending options
 * @description Configuration options for lending operations
 */
export interface LendOptions {
  /** Maximum slippage tolerance (basis points) */
  slippage?: number
  /** Deadline for transaction (timestamp) */
  deadline?: number
  /** Gas limit override */
  gasLimit?: bigint
  /** Gas price override */
  gasPrice?: bigint
}

/**
 * Base lending provider configuration
 * @description Base configuration shared by all lending providers
 */
export interface BaseLendConfig {
  /** Default slippage tolerance (basis points) */
  defaultSlippage?: number
  /** Allowlist of markets available for lending */
  marketAllowlist?: LendMarketConfig[]
}

/**
 * Morpho lending provider configuration
 * @description Configuration specific to Morpho lending provider
 */
export interface MorphoLendConfig extends BaseLendConfig {
  /** Lending provider name */
  provider: 'morpho'
  // Morpho-specific fields can be added here in the future
}

/**
 * Lending provider configuration
 * @description Union of all possible lending provider configurations
 */
export type LendConfig = MorphoLendConfig

/**
 * Market position information
 * @description Position details for a user in a lending market
 */
export interface LendMarketPosition {
  /** Asset balance in wei */
  balance: bigint
  /** Formatted asset balance */
  balanceFormatted: string
  /** Market shares owned */
  shares: bigint
  /** Formatted market shares */
  sharesFormatted: string
  /** Chain ID */
  chainId: number
}

/**
 * Base parameters shared between public and internal lending position interfaces
 */
export interface LendOpenPositionBaseParams {
  /** Asset to lend */
  asset: Asset
  /** Market identifier containing address and chainId */
  marketId: LendMarketId
  /** Wallet address for receiving shares and as owner (auto-populated by WalletLendNamespace) */
  walletAddress?: Address
  /** Optional lending configuration */
  options?: LendOptions
}

/**
 * Parameters for opening a lending position
 * @description Parameters required for opening a lending position
 */
export interface LendOpenPositionParams extends LendOpenPositionBaseParams {
  /** Amount to lend (human-readable number) */
  amount: number
}

/**
 * Internal parameters for provider _openPosition method with amount already converted to wei
 */
export interface LendOpenPositionInternalParams
  extends Omit<LendOpenPositionBaseParams, 'walletAddress'> {
  /** Amount to lend in wei */
  amountWei: bigint
  /** Wallet address for receiving shares and as owner (required in internal params) */
  walletAddress: Address
}

/**
 * Parameters for lend operation
 * @description Parameters required for lending assets
 */
export interface LendParams {
  /** Asset token address to lend */
  asset: Address
  /** Amount to lend (in wei) */
  amount: bigint
  /** Chain ID for the transaction */
  chainId: SupportedChainId
  /** Optional specific market ID */
  marketId?: string
  /** Optional lending configuration */
  options?: LendOptions
}

/**
 * Parameters for withdraw operation (internal)
 * @description Internal parameters required for withdrawing assets
 */
export interface LendClosePositionParams {
  /** Asset to withdraw (optional - will be validated against marketId) */
  asset?: Asset
  /** Amount to withdraw (in wei) */
  amount: bigint
  /** Market identifier containing address and chainId */
  marketId: LendMarketId
  /** Wallet address for receiving assets and as owner */
  walletAddress: Address
  /** Optional withdrawal configuration */
  options?: LendOptions
}

/**
 * Parameters for closing a lending position
 * @description Parameters required for withdrawing from a lending position
 */
export interface ClosePositionParams {
  /** Amount to withdraw (human-readable number) */
  amount: number
  /** Asset to withdraw (optional - will be validated against marketId) */
  asset?: Asset
  /** Market identifier containing address and chainId */
  marketId: LendMarketId
  /** Wallet address for receiving assets and as owner (auto-populated by WalletLendNamespace) */
  walletAddress?: Address
  /** Optional withdrawal configuration */
  options?: LendOptions
}

/**
 * Parameters for getting position information
 * @description Parameters for retrieving wallet position details
 */
export interface GetPositionParams {
  /** Optional specific market ID to get position for */
  marketId?: LendMarketId
  /** Optional asset to filter positions by */
  asset?: Asset
}

/**
 * Common filter parameters for asset and chain
 * @description Base interface for filtering by asset and/or chain
 */
export interface FilterAssetChain {
  /** Optional asset to filter by */
  asset?: Asset
  /** Optional chain ID to filter by */
  chainId?: SupportedChainId
}

/**
 * Parameters for getting lending markets
 * @description Parameters for filtering lending markets
 */
export interface GetLendMarketsParams extends FilterAssetChain {
  /** Optional pre-filtered market configs */
  markets?: LendMarketConfig[]
}

/**
 * Parameters for getting market balance
 * @description Parameters required for fetching market balance
 */
export interface GetMarketBalanceParams {
  /** Market identifier containing address and chainId */
  marketId: LendMarketId
  /** User wallet address to check balance for */
  walletAddress: Address
}

/**
 * Protected method signatures for LendProvider implementations
 * @description Type definitions for methods that must be implemented by all lending providers
 */
export interface LendProviderMethods {
  /**
   * Provider implementation of lend method
   * @param params - Lending operation parameters
   * @returns Promise resolving to lending transaction details
   */
  _lend({
    asset,
    amount,
    chainId,
    marketId,
    options,
  }: LendParams): Promise<LendTransaction>

  /**
   * Provider implementation of withdraw method
   * @param params - Withdrawal operation parameters
   * @returns Promise resolving to withdrawal transaction details
   */
  _withdraw(params: {
    asset: Address
    amount: bigint
    chainId: SupportedChainId
    marketId?: string
    options?: LendOptions
  }): Promise<LendTransaction>

  /**
   * Provider implementation of getMarket method
   * @param marketId - Market identifier containing address and chainId
   * @returns Promise resolving to market information
   */
  _getMarket(marketId: LendMarketId): Promise<LendMarket>

  /**
   * Provider implementation of getMarkets method
   * @returns Promise resolving to array of market information
   */
  _getMarkets(): Promise<LendMarket[]>

  /**
   * Provider implementation of getPosition method
   * @param params - Parameters for fetching position
   * @returns Promise resolving to position information
   */
  _getPosition({
    marketId,
    walletAddress,
  }: GetMarketBalanceParams): Promise<LendMarketPosition>
}
