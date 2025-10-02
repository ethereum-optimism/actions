import type { Address, Hash, Hex, TransactionReceipt } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

export { LendProvider } from '@/lend/core/LendProvider.js'
export { VerbsLendNamespace } from '@/lend/namespaces/VerbsLendNamespace.js'
export { WalletLendNamespace } from '@/lend/namespaces/WalletLendNamespace.js'

/**
 * Lending market identifier
 * @description Unique identifier for a lending market
 */
export type LendMarketId = {
  address: Address
  chainId: SupportedChainId
}

/**
 * Lending market configuration metadata
 * @description Additional configuration properties for a lending market
 */
export type LendMarketConfigMetadata = {
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
export type LendMarketConfig = LendMarketId & LendMarketConfigMetadata

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
 * Supply metrics for a lending market
 * @description Total assets and shares in the vault
 */
export interface LendMarketSupply {
  /** Total underlying assets in the vault */
  totalAssets: bigint
  /** Total vault shares issued */
  totalShares: bigint
}

/**
 * Lending transaction type
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
 * Lending transaction receipt
 */
export interface LendTransactionReceipt {
  receipt: TransactionReceipt<bigint, number, 'success' | 'reverted'>
  userOpHash?: Hash
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
  /** Total net APY after all components and fees */
  total: number
  /** Native APY from market lending (before fees) */
  native: number
  /** Total rewards APR from all sources */
  totalRewards: number
  /** Individual token rewards APRs (dynamically populated) */
  usdc?: number
  morpho?: number
  other?: number
  /** Performance/management fee rate */
  performanceFee: number
}

/**
 * Lending market metadata
 * @description Additional vault configuration and info
 */
export interface LendMarketMetadata {
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
 * Lending market (vault) information
 * @description Information about a lending market (Morpho vault)
 */
export interface LendMarket {
  /** Market identifier */
  marketId: LendMarketId
  /** Vault name */
  name: string
  /** Asset information */
  asset: Asset
  /** Supply metrics */
  supply: LendMarketSupply
  /** APY breakdown */
  apy: ApyBreakdown
  /** Additional vault metadata */
  metadata: LendMarketMetadata
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
  /** Market identifier */
  marketId: LendMarketId
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
   * Provider implementation of openPosition method
   * @param params - Open position operation parameters
   * @returns Promise resolving to transaction data
   */
  _openPosition(
    params: LendOpenPositionInternalParams,
  ): Promise<TransactionData>

  /**
   * Provider implementation of closePosition method
   * @param params - Close position operation parameters
   * @returns Promise resolving to transaction data
   */
  _closePosition(params: LendClosePositionParams): Promise<TransactionData>

  /**
   * Provider implementation of getMarket method
   * @param marketId - Market identifier containing address and chainId
   * @returns Promise resolving to market information
   */
  _getMarket(marketId: LendMarketId): Promise<LendMarket>

  /**
   * Provider implementation of getMarkets method
   * @param params - Optional filtering parameters
   * @returns Promise resolving to array of market information
   */
  _getMarkets(params: GetLendMarketsParams): Promise<LendMarket[]>

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
