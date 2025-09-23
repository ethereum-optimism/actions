import type { Address } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type {
  BaseLendConfig,
  GetLendMarketParams,
  GetLendMarketsParams,
  GetMarketBalanceParams,
  LendMarket,
  LendMarketBalance,
  LendMarketConfig,
  LendMarketId,
  LendOpenPositionParams,
  LendOptions,
  LendTransaction,
  WithdrawParams,
} from '@/types/lend.js'

/**
 * Lending provider abstract class
 * @description Base class for lending provider implementations
 */
export abstract class LendProvider<
  TConfig extends BaseLendConfig = BaseLendConfig,
> {
  /** Lending provider configuration */
  protected readonly _config: TConfig

  /**
   * Supported chain IDs
   * @description Array of chain IDs that this provider supports
   */
  protected abstract readonly SUPPORTED_CHAIN_IDS: readonly number[]

  /**
   * Create a new lending provider
   * @param config - Provider-specific lending configuration
   */
  protected constructor(config: TConfig) {
    this._config = config
  }

  public get config(): TConfig {
    return this._config
  }

  /**
   * Get supported chain IDs
   * @description Returns an array of chain IDs that this provider supports
   * @returns Array of supported chain IDs
   */
  supportedChainIds(): number[] {
    return [...this.SUPPORTED_CHAIN_IDS]
  }

  /**
   * Open a lending position
   * @param amount - Amount to lend (human-readable number)
   * @param asset - Asset to lend
   * @param marketId - Market identifier containing address and chainId
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   */
  async openPosition({
    amount,
    asset,
    marketId,
    options,
  }: LendOpenPositionParams): Promise<LendTransaction> {
    this.validateProviderSupported(marketId.chainId)
    this.validateConfigSupported(marketId)
    return this._openPosition({ amount, asset, marketId, options })
  }

  /**
   * Get detailed market information
   * @param address - Market contract address
   * @param chainId - Chain ID where the market exists
   * @returns Promise resolving to market information
   */
  async getMarket({
    address,
    chainId,
  }: GetLendMarketParams): Promise<LendMarket> {
    const marketId: LendMarketId = { address, chainId }

    this.validateProviderSupported(chainId)
    this.validateConfigSupported(marketId)
    return this._getMarket(marketId)
  }

  /**
   * Get list of available lending markets
   * @param params - Optional filtering parameters
   * @returns Promise resolving to array of market information
   */
  async getMarkets({
    asset,
    chainId,
    markets,
  }: GetLendMarketsParams = {}): Promise<LendMarket[]> {
    if (chainId !== undefined) this.validateProviderSupported(chainId)

    const filteredMarkets = this.filterMarketConfigs(chainId, asset)

    return this._getMarkets({
      asset,
      chainId,
      markets: markets || filteredMarkets,
    })
  }

  private filterMarketConfigs(
    chainId?: SupportedChainId,
    asset?: Asset,
  ): LendMarketConfig[] {
    let configs = this._config.marketAllowlist || []
    if (chainId !== undefined)
      configs = configs.filter((m) => m.chainId === chainId)
    if (asset !== undefined) configs = configs.filter((m) => m.asset === asset)
    return configs
  }

  /**
   * Get market balance for a specific wallet address
   * @param marketId - Market identifier containing address and chainId
   * @param walletAddress - User wallet address to check balance for
   * @returns Promise resolving to market balance information
   */
  async getMarketBalance(
    marketId: LendMarketId,
    walletAddress: Address,
  ): Promise<LendMarketBalance> {
    this.validateProviderSupported(marketId.chainId)
    this.validateConfigSupported(marketId)

    return this._getMarketBalance({ marketId, walletAddress })
  }

  /**
   * Withdraw/redeem assets from a market
   * @param asset - Asset token address to withdraw
   * @param amount - Amount to withdraw (in wei)
   * @param chainId - Chain ID for the transaction
   * @param marketId - Optional specific market ID
   * @param options - Optional withdrawal configuration
   * @returns Promise resolving to withdrawal transaction details
   */
  async withdraw(
    asset: Address,
    amount: bigint,
    chainId: SupportedChainId,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    this.validateProviderSupported(chainId)
    return this._withdraw({ asset, amount, chainId, marketId, options })
  }

  /**
   * Check if a chain is supported by this lending provider
   * @param chainId - Chain ID to check
   * @returns true if chain is supported, false otherwise
   */
  protected isChainSupported(chainId: number): boolean {
    return this.SUPPORTED_CHAIN_IDS.includes(chainId)
  }

  /**
   * Validate that a chainId is supported for lending operations
   * @param chainId - Chain ID to validate
   * @throws Error if chain is not supported
   */
  protected validateProviderSupported(chainId: number): void {
    if (!this.isChainSupported(chainId)) {
      throw new Error(
        `Chain ${chainId} is not supported. Supported chains: ${this.SUPPORTED_CHAIN_IDS.join(', ')}`,
      )
    }
  }

  /**
   * Validate that a market is in the config's market allowlist
   * @param marketId - Market identifier containing address and chainId
   * @throws Error if market allowlist is configured but market is not in it
   */
  protected validateConfigSupported(marketId: LendMarketId): void {
    if (
      !this._config.marketAllowlist ||
      this._config.marketAllowlist.length === 0
    ) {
      return
    }

    const foundMarket = this._config.marketAllowlist.find(
      (allowedMarket) =>
        allowedMarket.address.toLowerCase() ===
          marketId.address.toLowerCase() &&
        allowedMarket.chainId === marketId.chainId,
    )

    if (!foundMarket) {
      throw new Error(
        `Market ${marketId.address} on chain ${marketId.chainId} is not in the market allowlist`,
      )
    }
  }

  /**
   * Abstract methods that must be implemented by providers
   */

  /**
   * Provider implementation of openPosition method
   * @description Must be implemented by providers
   */
  protected abstract _openPosition({
    amount,
    asset,
    marketId,
    options,
  }: LendOpenPositionParams): Promise<LendTransaction>

  /**
   * Provider implementation of getMarket method
   * @description Must be implemented by providers
   */
  protected abstract _getMarket(marketId: LendMarketId): Promise<LendMarket>

  /**
   * Provider implementation of getMarkets method
   * @description Must be implemented by providers
   */
  protected abstract _getMarkets({
    asset,
    chainId,
    markets,
  }: GetLendMarketsParams): Promise<LendMarket[]>

  /**
   * Provider implementation of getMarketBalance method
   * @description Must be implemented by providers
   */
  protected abstract _getMarketBalance({
    marketId,
    walletAddress,
  }: GetMarketBalanceParams): Promise<LendMarketBalance>

  /**
   * Provider implementation of withdraw method
   * @description Must be implemented by providers
   */
  protected abstract _withdraw({
    asset,
    amount,
    chainId,
    marketId,
    options,
  }: WithdrawParams): Promise<LendTransaction>
}
