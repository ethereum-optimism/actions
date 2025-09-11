import type { Address, Hex } from 'viem'

export { LendProvider } from '../lend/provider.js'

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
export interface LendMarket {
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
export interface LendMarketInfo extends LendMarket {
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
 * Lending vault information
 * @description Information about a Morpho vault
 */
export interface LendVaultInfo {
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
 * Lending provider configuration
 * @description Configuration for lending providers
 */
export type LendConfig = MorphoLendConfig

/**
 * Morpho lending provider configuration
 * @description Configuration specific to Morpho lending provider
 */
export interface MorphoLendConfig {
  /** Lending provider type */
  type: 'morpho'
  /** Default slippage tolerance (basis points) */
  defaultSlippage?: number
}

/**
 * Read-only lend operations available on verbs.lend
 * @description Interface for read-only lending operations
 */
export interface LendReadOperations {
  /** Get list of available lending markets */
  getMarkets(): Promise<LendVaultInfo[]>
  /** Get detailed information for a specific market */
  getVault(vaultAddress: Address): Promise<LendVaultInfo>
  /** Get vault balance for a specific wallet */
  getVaultBalance(
    vaultAddress: Address,
    walletAddress: Address,
  ): Promise<{
    balance: bigint
    balanceFormatted: string
    shares: bigint
    sharesFormatted: string
    chainId: number
  }>
  /** Get list of supported network IDs */
  supportedNetworkIds(): number[]
}

/**
 * Write operations for lending
 * @description Interface for write operations that modify lending positions
 */
export interface LendWriteOperations {
  /** will be renamed execute(). Lend assets to a market */
  lend(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>
  /** Deposit assets (alias for lend) */
  deposit(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>
  /** Withdraw assets from a market */
  withdraw(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>
}

/**
 * Full lend operations available on wallet.lend
 * @description Interface combining both read and write lending operations
 */
export interface WalletLendOperations
  extends LendReadOperations,
    LendWriteOperations {}
