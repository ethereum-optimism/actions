import type { Address } from 'viem'
import { parseUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  SwapExecuteInternalParams,
  SwapExecuteParams,
  SwapMarket,
  SwapMarketFilter,
  SwapPrice,
  SwapPriceParams,
  SwapProviderConfig,
  SwapTransaction,
} from '@/types/swap/index.js'
import { isAssetSupportedOnChain } from '@/utils/assets.js'

/** Default slippage tolerance (0.5%) */
const DEFAULT_SLIPPAGE = 0.005

/** Default deadline offset (1 minute) */
const DEFAULT_DEADLINE_OFFSET = 60

/**
 * Abstract base class for swap providers
 * @description Defines the interface for all swap provider implementations.
 * Uses template method pattern - public methods handle validation and conversion,
 * protected abstract methods implement provider-specific logic.
 */
export abstract class SwapProvider<
  TConfig extends SwapProviderConfig = SwapProviderConfig,
> {
  protected readonly _config: TConfig
  protected readonly chainManager: ChainManager

  constructor(config: TConfig, chainManager: ChainManager) {
    this._config = config
    this.chainManager = chainManager
  }

  /** Provider configuration */
  get config(): TConfig {
    return this._config
  }

  /** Default slippage from config or provider default */
  get defaultSlippage(): number {
    return this._config.defaultSlippage ?? DEFAULT_SLIPPAGE
  }

  /**
   * Execute a token swap
   * @param params - Swap parameters
   * @returns Swap transaction data ready for execution
   */
  async execute(
    params: SwapExecuteParams & {
      walletAddress: Address
      chainId: SupportedChainId
    },
  ): Promise<SwapTransaction> {
    // Validate at least one amount is provided
    if (params.amountIn === undefined && params.amountOut === undefined) {
      throw new Error('Either amountIn or amountOut must be provided')
    }

    // Validate chain support
    this.validateChainSupported(params.chainId)

    // Validate market is allowed
    this.validateMarketAllowed(params.assetIn, params.assetOut, params.chainId)

    // Validate assets are supported on chain
    if (!isAssetSupportedOnChain(params.assetIn, params.chainId)) {
      throw new Error(
        `Asset ${params.assetIn.metadata.symbol} not supported on chain ${params.chainId}`,
      )
    }
    if (!isAssetSupportedOnChain(params.assetOut, params.chainId)) {
      throw new Error(
        `Asset ${params.assetOut.metadata.symbol} not supported on chain ${params.chainId}`,
      )
    }

    // Convert amounts to wei
    const amountInWei =
      params.amountIn !== undefined
        ? parseUnits(
            params.amountIn.toString(),
            params.assetIn.metadata.decimals,
          )
        : undefined

    const amountOutWei =
      params.amountOut !== undefined
        ? parseUnits(
            params.amountOut.toString(),
            params.assetOut.metadata.decimals,
          )
        : undefined

    // Build internal params with defaults
    const internalParams: SwapExecuteInternalParams = {
      amountInWei,
      amountOutWei,
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      slippage: params.slippage ?? this.defaultSlippage,
      deadline:
        params.deadline ??
        Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_OFFSET,
      recipient: params.recipient ?? params.walletAddress,
      walletAddress: params.walletAddress,
      chainId: params.chainId,
    }

    return this._execute(internalParams)
  }

  /**
   * Get price quote for a swap
   * @param params - Price query parameters
   * @returns Price quote with route information
   */
  async getPrice(params: SwapPriceParams): Promise<SwapPrice> {
    this.validateChainSupported(params.chainId)
    return this._getPrice(params)
  }

  /**
   * Get a specific swap market by ID
   * @param params - Market identifier and chain
   * @returns Market information
   */
  async getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    this.validateChainSupported(params.chainId)
    return this._getMarket(params)
  }

  /**
   * Get available swap markets
   * @param params - Optional filtering by chainId or asset
   * @returns Array of swap markets
   */
  async getMarkets(params: GetSwapMarketsParams = {}): Promise<SwapMarket[]> {
    if (params.chainId) {
      this.validateChainSupported(params.chainId)
    }
    return this._getMarkets(params)
  }

  /**
   * Get supported chain IDs for this provider
   */
  abstract supportedChainIds(): SupportedChainId[]

  /**
   * Check if a chain is supported
   */
  isChainSupported(chainId: SupportedChainId): boolean {
    return this.supportedChainIds().includes(chainId)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Protected abstract methods (implement in provider)
  // ─────────────────────────────────────────────────────────────────────────────

  protected abstract _execute(
    params: SwapExecuteInternalParams,
  ): Promise<SwapTransaction>

  protected abstract _getPrice(params: SwapPriceParams): Promise<SwapPrice>

  protected abstract _getMarket(
    params: GetSwapMarketParams,
  ): Promise<SwapMarket>

  protected abstract _getMarkets(
    params: GetSwapMarketsParams,
  ): Promise<SwapMarket[]>

  // ─────────────────────────────────────────────────────────────────────────────
  // Protected validation helpers
  // ─────────────────────────────────────────────────────────────────────────────

  protected validateChainSupported(chainId: SupportedChainId): void {
    if (!this.isChainSupported(chainId)) {
      throw new Error(
        `Chain ${chainId} is not supported by this swap provider. ` +
          `Supported chains: ${this.supportedChainIds().join(', ')}`,
      )
    }
  }

  protected validateMarketAllowed(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): void {
    const { marketBlocklist, marketAllowlist } = this._config

    // Check blocklist first
    if (marketBlocklist?.length) {
      const isBlocked = this.isPairInList(
        assetIn,
        assetOut,
        chainId,
        marketBlocklist,
      )
      if (isBlocked) {
        throw new Error(
          `Pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol} is blocked on chain ${chainId}`,
        )
      }
    }

    // Check allowlist if configured
    if (marketAllowlist?.length) {
      const isAllowed = this.isPairInList(
        assetIn,
        assetOut,
        chainId,
        marketAllowlist,
      )
      if (!isAllowed) {
        throw new Error(
          `Pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol} is not in the allowlist for chain ${chainId}`,
        )
      }
    }
  }

  private isPairInList(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
    list: SwapMarketFilter[],
  ): boolean {
    const symbolIn = assetIn.metadata.symbol.toLowerCase()
    const symbolOut = assetOut.metadata.symbol.toLowerCase()

    return list.some((filter) => {
      // If filter specifies a chainId and it doesn't match, skip
      if (filter.chainId !== undefined && filter.chainId !== chainId)
        return false

      // Generate all unique pairs from filter.assets and check for match
      const symbols = filter.assets.map((a) => a.metadata.symbol.toLowerCase())
      for (let i = 0; i < symbols.length; i++) {
        for (let j = i + 1; j < symbols.length; j++) {
          if (
            (symbolIn === symbols[i] && symbolOut === symbols[j]) ||
            (symbolIn === symbols[j] && symbolOut === symbols[i])
          ) {
            return true
          }
        }
      }
      return false
    })
  }
}
