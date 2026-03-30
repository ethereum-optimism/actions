import type { Address } from 'viem'
import { parseUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { ACTIONS_SUPPORTED_CHAIN_IDS } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type {
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
  TransactionData,
} from '@/types/lend/index.js'
import { buildErc20ApprovalTx } from '@/utils/approve.js'
import { validateMarketAsset } from '@/utils/markets.js'
import { validateChainSupported } from '@/utils/validation.js'

/**
 * Lending provider abstract class
 * @description Base class for lending provider implementations
 */
export abstract class LendProvider<
  TConfig extends LendProviderConfig = LendProviderConfig,
> {
  /** Lending provider configuration */
  protected readonly _config: TConfig

  /** Chain manager for blockchain interactions */
  protected readonly chainManager: ChainManager

  /**
   * Create a new lending provider
   * @param config - Provider-specific lending configuration
   * @param chainManager - Chain manager for blockchain interactions
   */
  protected constructor(config: TConfig, chainManager: ChainManager) {
    this._config = config
    this.chainManager = chainManager
  }

  public get config(): TConfig {
    return this._config
  }

  /**
   * Chain IDs supported by the underlying protocol.
   * @description Each provider implements this to declare the chains its protocol
   * is deployed on, without any SDK-level or developer-config filtering.
   * @returns Array of chain IDs the protocol natively supports
   */
  abstract protocolSupportedChainIds(): number[]

  /**
   * Effective supported chain IDs.
   * @description Intersection of the protocol's supported chains,
   * the Actions SDK's known chains, and the developer's ActionsConfig.chains.
   * All validation in public methods uses this set.
   * @returns Array of chain IDs usable through this provider instance
   */
  supportedChainIds(): number[] {
    const configuredChains = this.chainManager.getSupportedChains()
    return this.protocolSupportedChainIds().filter(
      (id) =>
        (ACTIONS_SUPPORTED_CHAIN_IDS as readonly number[]).includes(id) &&
        (configuredChains as number[]).includes(id),
    )
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
    if (!params.walletAddress) {
      throw new Error('walletAddress is required')
    }

    this.validateConfigSupported(params.marketId)

    // Convert human-readable amount to wei using the asset's decimals
    const amountWei = parseUnits(
      params.amount.toString(),
      params.asset.metadata.decimals,
    )

    return this._openPosition({
      ...params,
      amountWei,
      walletAddress: params.walletAddress,
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
      validateChainSupported(params.chainId, this.supportedChainIds())

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

    this.validateConfigSupported(marketId)

    return this._getPosition({ marketId, walletAddress })
  }

  /**
   * Close a lending position (withdraw assets from a market)
   * @param amount - Amount to withdraw (human-readable number)
   * @param asset - Asset to withdraw (optional, validated against marketId)
   * @param marketId - Market identifier containing address and chainId
   * @param walletAddress - Wallet address for receiving assets and as owner
   * @param options - Optional withdrawal configuration
   * @returns Promise resolving to withdrawal transaction details
   */
  async closePosition(params: ClosePositionParams): Promise<LendTransaction> {
    if (!params.walletAddress) {
      throw new Error('walletAddress is required')
    }

    this.validateConfigSupported(params.marketId)

    const market = await this.getMarket({
      address: params.marketId.address,
      chainId: params.marketId.chainId,
    })

    if (params.asset) {
      validateMarketAsset(market, params.asset)
    }

    const assetMetadata = params.asset?.metadata
    if (!assetMetadata) {
      throw new Error('Asset metadata is required for decimal conversion')
    }

    // Convert human-readable amount to wei using the asset's decimals
    const amountWei = parseUnits(
      params.amount.toString(),
      assetMetadata.decimals,
    )

    return this._closePosition({
      asset: params.asset,
      amountRaw: amountWei,
      marketId: params.marketId,
      walletAddress: params.walletAddress,
      options: params.options,
    })
  }

  /**
   * Check if a chain is supported by this lending provider
   * @param chainId - Chain ID to check
   * @returns true if chain is supported, false otherwise
   */
  protected isChainSupported(chainId: number): boolean {
    return this.supportedChainIds().includes(chainId)
  }

  /**
   * Validate that a market is in the config's market allowlist
   * @param marketId - Market identifier containing address and chainId
   * @throws Error if market allowlist is configured but market is not in it
   */
  protected validateConfigSupported(marketId: LendMarketId): void {
    validateChainSupported(marketId.chainId, this.supportedChainIds())

    if (
      !this._config.marketAllowlist ||
      this._config.marketAllowlist.length === 0
    ) {
      return
    }

    const foundMarket = this._config.marketAllowlist.find(
      (allowedMarket: LendMarketConfig) =>
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
      configs = configs.filter((m: LendMarketConfig) => m.chainId === chainId)
    if (asset !== undefined)
      configs = configs.filter((m: LendMarketConfig) => m.asset === asset)
    return configs
  }

  /**
   * Build an ERC20 approval transaction
   * @param tokenAddress - Address of the token to approve
   * @param spender - Address to approve spending for
   * @param amount - Amount to approve
   * @returns Transaction data for the approval
   */
  protected buildApprovalTx(
    tokenAddress: Address,
    spender: Address,
    amount: bigint,
  ): TransactionData {
    return buildErc20ApprovalTx(tokenAddress, spender, amount)
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
