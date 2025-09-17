import type { Address, Hex } from 'viem'

import type { SupportedChainId } from '../constants/supportedChains.js'
import type { Asset } from './token.js'

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
 * Lending market configuration
 * @description Configuration for a lending market including asset information and provider
 */
export interface LendMarketConfig extends LendMarketId {
  /** Human-readable name for the market */
  name: string
  /** Asset information for this market */
  asset: Asset
  /** Lending provider type */
  lendProvider: 'morpho'
}

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
    /** Main deposit transaction */
    deposit: TransactionData
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
  /** Receiver address for shares (defaults to sender) */
  receiver?: Address //TODO remove and enforce from wallet
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
 * Lending provider configuration
 * @description Configuration for lending providers
 */
export type LendConfig = MorphoLendConfig

/**
 * Morpho lending provider configuration
 * @description Configuration specific to Morpho lending provider
 */
export interface MorphoLendConfig extends BaseLendConfig {
  /** Lending provider name */
  provider: 'morpho'
}
