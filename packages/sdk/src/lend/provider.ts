import type { Address } from 'viem'
import { parseUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type {
  BaseLendConfig,
  ClosePositionParams,
  GetLendMarketParams,
  GetLendMarketsParams,
  GetMarketBalanceParams,
  LendClosePositionParams,
  LendMarket,
  LendMarketConfig,
  LendMarketId,
  LendMarketPosition,
  LendOpenPositionInternalParams,
  LendOpenPositionParams,
  LendTransaction,
} from '@/types/lend.js'
import { validateMarketAsset } from '@/utils/markets.js'

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
  async openPosition(params: LendOpenPositionParams): Promise<LendTransaction> {
    this.validateProviderSupported(params.marketId.chainId)
    this.validateConfigSupported(params.marketId)

    // Convert human-readable amount to wei using the asset's decimals
    const amountWei = parseUnits(
      params.amount.toString(),
      params.asset.metadata.decimals,
    )

    return this._openPosition({
      ...params,
      amountWei,
    })
  }

  /**
   * Get detailed market information
   * @param address - Market contract address
   * @param chainId - Chain ID where the market exists
   * @returns Promise resolving to market information
   */
  async getMarket(params: GetLendMarketParams): Promise<LendMarket> {
    const marketId: LendMarketId = {
      address: params.address,
      chainId: params.chainId,
    }

    this.validateProviderSupported(params.chainId)
    this.validateConfigSupported(marketId)
    return this._getMarket(marketId)
  }

  /**
   * Get list of available lending markets
   * @param params - Optional filtering parameters
   * @returns Promise resolving to array of market information
   */
  async getMarkets(params: GetLendMarketsParams = {}): Promise<LendMarket[]> {
    if (params.chainId !== undefined)
      this.validateProviderSupported(params.chainId)

    const filteredMarkets = this.filterMarketConfigs(
      params.chainId,
      params.asset,
    )

    return this._getMarkets({
      asset: params.asset,
      chainId: params.chainId,
      markets: params.markets || filteredMarkets,
    })
  }

  /**
   * Get position information for a wallet
   * @param walletAddress - User wallet address to check position for
   * @param marketId - Market identifier (required)
   * @param asset - Asset filter (not yet supported)
   * @returns Promise resolving to position information
   */
  async getPosition(
    walletAddress: Address,
    marketId?: LendMarketId,
    asset?: Asset,
  ): Promise<LendMarketPosition> {
    // For now, require marketId (asset-only and empty params not yet supported)
    if (!marketId) {
      throw new Error(
        'marketId is required. Querying all positions or by asset is not yet supported.',
      )
    }

    if (asset) {
      throw new Error(
        'Filtering by asset is not yet supported. Please provide only marketId.',
      )
    }

    this.validateProviderSupported(marketId.chainId)
    this.validateConfigSupported(marketId)

    return this._getPosition({ marketId, walletAddress })
  }

  /**
   * Close a lending position (withdraw assets from a market)
   * @param amount - Amount to withdraw (human-readable number)
   * @param asset - Asset to withdraw (optional, validated against marketId)
   * @param marketId - Market identifier containing address and chainId
   * @param options - Optional withdrawal configuration
   * @returns Promise resolving to withdrawal transaction details
   */
  async closePosition(params: ClosePositionParams): Promise<LendTransaction> {
    this.validateProviderSupported(params.marketId.chainId)
    this.validateConfigSupported(params.marketId)

    // Get the market info once for both validation and asset extraction
    const market = await this.getMarket({
      address: params.marketId.address,
      chainId: params.marketId.chainId,
    })

    // If asset is provided, validate it matches the market's asset
    if (params.asset) {
      validateMarketAsset(market, params.asset)
    }

    const assetAddress = market.asset as Address

    // Convert human-readable amount to wei
    const amountWei = BigInt(params.amount) // TODO: Add proper decimal conversion

    return this._closePosition({
      asset: assetAddress,
      amount: amountWei,
      chainId: params.marketId.chainId,
      marketId: params.marketId.address,
      options: params.options,
    })
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
   * Helper method to filter market configurations
   * @param chainId - Chain ID to filter by
   * @param asset - Asset to filter by
   * @returns Filtered market configurations
   */
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
   * Abstract methods that must be implemented by providers
   */

  /**
   * Provider implementation of openPosition method
   * @description Must be implemented by providers
   */
  protected abstract _openPosition(
    params: LendOpenPositionInternalParams,
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
  protected abstract _getMarkets(
    params: GetLendMarketsParams,
  ): Promise<LendMarket[]>

  /**
   * Provider implementation of getPosition method
   * @description Must be implemented by providers
   */
  protected abstract _getPosition(
    params: GetMarketBalanceParams,
  ): Promise<LendMarketPosition>

  /**
   * Provider implementation of closePosition method
   * @description Must be implemented by providers
   */
  protected abstract _closePosition(
    params: LendClosePositionParams,
  ): Promise<LendTransaction>
}
