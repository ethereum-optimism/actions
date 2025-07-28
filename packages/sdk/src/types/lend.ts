import type { Address } from 'viem'

/**
 * Lending provider abstract class
 * @description Base class for lending provider implementations
 */
export abstract class LendProvider {
  /**
   * Supported networks configuration
   * @description Must be implemented by concrete providers
   */
  protected abstract readonly SUPPORTED_NETWORKS: Record<
    string,
    {
      chainId: number
      name: string
      [key: string]: any
    }
  >

  /**
   * Lend/supply assets to a market
   * @param asset - Asset token address to lend
   * @param amount - Amount to lend (in wei)
   * @param marketId - Optional specific market ID
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   */
  abstract lend(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>

  /**
   * Get detailed vault information
   * @param vaultAddress - Vault address
   * @returns Promise resolving to vault information
   */
  abstract getVault(vaultAddress: Address): Promise<LendVaultInfo>

  /**
   * Get list of available vaults
   * @returns Promise resolving to array of vault information
   */
  abstract getVaults(): Promise<LendVaultInfo[]>

  /**
   * Withdraw/redeem assets from a market
   * @param asset - Asset token address to withdraw
   * @param amount - Amount to withdraw (in wei)
   * @param marketId - Optional specific market ID
   * @param options - Optional withdrawal configuration
   * @returns Promise resolving to withdrawal transaction details
   */
  abstract withdraw(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>

  /**
   * Get supported network IDs
   * @description Returns an array of chain IDs that this provider supports
   * @returns Array of supported network chain IDs
   */
  supportedNetworkIds(): number[] {
    return Object.values(this.SUPPORTED_NETWORKS).map(
      (network) => network.chainId,
    )
  }
}

/**
 * Lending transaction result
 * @description Result of a lending operation
 */
export interface LendTransaction {
  /** Transaction hash */
  hash: string
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
  /** USDC rewards APR */
  usdcRewardsApr?: number
  /** MORPHO token rewards APR */
  morphoRewardsApr?: number
  /** Other rewards APR */
  otherRewardsApr?: number
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
  /** Available deposit capacity */
  depositCapacity: bigint
  /** Available withdrawal capacity */
  withdrawalCapacity: bigint
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
