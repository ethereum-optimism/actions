import type { Address } from 'viem'

import type {
  BaseLendConfig,
  LendMarket,
  LendMarketId,
  LendOptions,
  LendTransaction,
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
   * Supported network IDs
   * @description Array of chain IDs that this provider supports
   */
  protected abstract readonly SUPPORTED_NETWORK_IDS: readonly number[]

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
   * Get supported network IDs
   * @description Returns an array of chain IDs that this provider supports
   * @returns Array of supported network chain IDs
   */
  supportedNetworkIds(): number[] {
    return [...this.SUPPORTED_NETWORK_IDS]
  }

  /**
   * Lend/supply assets to a market
   * @param asset - Asset token address to lend
   * @param amount - Amount to lend (in wei)
   * @param chainId - Chain ID for the transaction
   * @param marketId - Optional specific market ID
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   */
  async lend(
    asset: Address,
    amount: bigint,
    chainId: number,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    this.validateChainIdSupported(chainId)
    return this._lend(asset, amount, chainId, marketId, options)
  }

  /**
   * Deposit assets to a market (alias for lend)
   * @param asset - Asset token address to deposit
   * @param amount - Amount to deposit (in wei)
   * @param chainId - Chain ID for the transaction
   * @param marketId - Optional specific market ID
   * @param options - Optional deposit configuration
   * @returns Promise resolving to deposit transaction details
   */
  async deposit(
    asset: Address,
    amount: bigint,
    chainId: number,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    return this.lend(asset, amount, chainId, marketId, options)
  }

  /**
   * Get detailed market information
   * @param marketId - Market identifier containing address and chainId
   * @returns Promise resolving to market information
   */
  async getMarket(marketId: LendMarketId): Promise<LendMarket> {
    this.validateNetworkSupported(marketId)
    this.validateConfigSupported(marketId)

    return this._getMarket(marketId)
  }

  /**
   * Get list of available lending markets
   * @returns Promise resolving to array of market information
   */
  async getMarkets(): Promise<LendMarket[]> {
    return this._getMarkets()
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
  ): Promise<{
    balance: bigint
    balanceFormatted: string
    shares: bigint
    sharesFormatted: string
    chainId: number
  }> {
    this.validateNetworkSupported(marketId)
    this.validateConfigSupported(marketId)

    return this._getMarketBalance(marketId, walletAddress)
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
    chainId: number,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    this.validateChainIdSupported(chainId)
    return this._withdraw(asset, amount, chainId, marketId, options)
  }

  /**
   * Check if a network is supported by this lending provider
   * @param chainId - Chain ID to check
   * @returns true if network is supported, false otherwise
   */
  protected isNetworkSupported(chainId: number): boolean {
    return this.SUPPORTED_NETWORK_IDS.includes(chainId)
  }

  /**
   * Validate that a market's network is supported
   * @param marketId - Market identifier containing chainId
   * @throws Error if network is not supported
   */
  protected validateNetworkSupported(marketId: LendMarketId): void {
    if (!this.isNetworkSupported(marketId.chainId)) {
      throw new Error(
        `Network ${marketId.chainId} is not supported. Supported networks: ${this.SUPPORTED_NETWORK_IDS.join(', ')}`,
      )
    }
  }

  /**
   * Validate that a chainId is supported for lending operations
   * @param chainId - Chain ID to validate
   * @throws Error if network is not supported
   */
  protected validateChainIdSupported(chainId: number): void {
    if (!this.isNetworkSupported(chainId)) {
      throw new Error(
        `Network ${chainId} is not supported. Supported networks: ${this.SUPPORTED_NETWORK_IDS.join(', ')}`,
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
   * Provider implementation of lend method
   * @description Must be implemented by providers
   */
  protected abstract _lend(
    asset: Address,
    amount: bigint,
    chainId: number,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>

  /**
   * Provider implementation of getMarket method
   * @description Must be implemented by providers
   */
  protected abstract _getMarket(marketId: LendMarketId): Promise<LendMarket>

  /**
   * Provider implementation of getMarkets method
   * @description Must be implemented by providers
   */
  protected abstract _getMarkets(): Promise<LendMarket[]>

  /**
   * Provider implementation of getMarketBalance method
   * @description Must be implemented by providers
   */
  protected abstract _getMarketBalance(
    marketId: LendMarketId,
    walletAddress: Address,
  ): Promise<{
    balance: bigint
    balanceFormatted: string
    shares: bigint
    sharesFormatted: string
    chainId: number
  }>

  /**
   * Provider implementation of withdraw method
   * @description Must be implemented by providers
   */
  protected abstract _withdraw(
    asset: Address,
    amount: bigint,
    chainId: number,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>
}
