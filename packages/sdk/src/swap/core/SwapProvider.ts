import type { Address } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  ResolvedSwapParams,
  SwapExecuteParams,
  SwapMarket,
  SwapMarketFilter,
  SwapPrice,
  SwapPriceParams,
  SwapProviderConfig,
  SwapTransaction,
} from '@/types/swap/index.js'
import { isAssetSupportedOnChain, parseAssetAmount } from '@/utils/assets.js'

const DEFAULT_SLIPPAGE = 0.005
const DEFAULT_DEADLINE_OFFSET = 60
const MAX_SLIPPAGE = 0.5

/**
 * Abstract base class for swap providers.
 * Public methods handle validation and conversion,
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

  get config(): TConfig {
    return this._config
  }

  get defaultSlippage(): number {
    return this._config.defaultSlippage ?? DEFAULT_SLIPPAGE
  }

  /**
   * Execute a token swap
   * @param params - Swap parameters including assets, amounts, and chain
   * @returns Swap transaction data ready for execution
   */
  async execute(
    params: SwapExecuteParams & {
      walletAddress: Address
      chainId: SupportedChainId
    },
  ): Promise<SwapTransaction> {
    this.validateAmountProvided(params.amountIn, params.amountOut)
    this.validateNotSameAsset(params.assetIn, params.assetOut)
    this.validateChainSupported(params.chainId)
    this.validateMarketAllowed(params.assetIn, params.assetOut, params.chainId)
    this.validateAssetOnChain(params.assetIn, params.chainId)
    this.validateAssetOnChain(params.assetOut, params.chainId)

    const internalParams = this.resolveParams(params)
    this.validateSlippage(internalParams.slippage)

    return this._execute(internalParams)
  }

  /** Get price quote for a swap */
  async getPrice(params: SwapPriceParams): Promise<SwapPrice> {
    this.validateChainSupported(params.chainId)
    return this._getPrice(params)
  }

  /** Get a specific swap market by ID */
  async getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    this.validateChainSupported(params.chainId)
    return this._getMarket(params)
  }

  /** Get available swap markets, optionally filtered by chainId or asset */
  async getMarkets(params: GetSwapMarketsParams = {}): Promise<SwapMarket[]> {
    if (params.chainId) {
      this.validateChainSupported(params.chainId)
    }
    return this._getMarkets(params)
  }

  isChainSupported(chainId: SupportedChainId): boolean {
    return this.supportedChainIds().includes(chainId)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Protected helpers
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

    if (marketBlocklist?.length) {
      const isBlocked = this.findMatchingFilter(
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

    if (marketAllowlist?.length) {
      const isAllowed = this.findMatchingFilter(
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

  protected resolveMarketFilter(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): SwapMarketFilter | undefined {
    const { marketAllowlist } = this._config
    if (!marketAllowlist?.length) return undefined
    return this.findMatchingFilter(assetIn, assetOut, chainId, marketAllowlist)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private validateAmountProvided(amountIn?: number, amountOut?: number): void {
    if (amountIn === undefined && amountOut === undefined) {
      throw new Error('Either amountIn or amountOut must be provided')
    }
  }

  private validateNotSameAsset(assetIn: Asset, assetOut: Asset): void {
    if (
      assetIn.metadata.symbol.toLowerCase() ===
      assetOut.metadata.symbol.toLowerCase()
    ) {
      throw new Error('Cannot swap an asset for itself')
    }
  }

  private validateSlippage(slippage: number): void {
    if (slippage < 0 || slippage > MAX_SLIPPAGE) {
      throw new Error(
        `Slippage ${slippage} exceeds allowed range [0, ${MAX_SLIPPAGE * 100}%]`,
      )
    }
  }

  private resolveParams(
    params: SwapExecuteParams & {
      walletAddress: Address
      chainId: SupportedChainId
    },
  ): ResolvedSwapParams {
    return {
      amountInWei:
        params.amountIn !== undefined
          ? parseAssetAmount({
              amount: params.amountIn,
              decimals: params.assetIn.metadata.decimals,
            })
          : undefined,
      amountOutWei:
        params.amountOut !== undefined
          ? parseAssetAmount({
              amount: params.amountOut,
              decimals: params.assetOut.metadata.decimals,
            })
          : undefined,
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      slippage: params.slippage ?? this.defaultSlippage,
      deadline:
        params.deadline ??
        Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_OFFSET,
      // Send output tokens to specified recipient, or back to the initiating wallet
      recipient: params.recipient ?? params.walletAddress,
      walletAddress: params.walletAddress,
      chainId: params.chainId,
    }
  }

  private validateAssetOnChain(asset: Asset, chainId: SupportedChainId): void {
    if (!isAssetSupportedOnChain(asset, chainId)) {
      throw new Error(
        `Asset ${asset.metadata.symbol} not supported on chain ${chainId}`,
      )
    }
  }

  private findMatchingFilter(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
    list: SwapMarketFilter[],
  ): SwapMarketFilter | undefined {
    const symbolIn = assetIn.metadata.symbol.toLowerCase()
    const symbolOut = assetOut.metadata.symbol.toLowerCase()

    return list.find((filter) => {
      if (filter.chainId !== undefined && filter.chainId !== chainId)
        return false
      return this.filterContainsPair(symbolIn, symbolOut, filter.assets)
    })
  }

  private filterContainsPair(
    symbolIn: string,
    symbolOut: string,
    assets: Asset[],
  ): boolean {
    const symbols = assets.map((a) => a.metadata.symbol.toLowerCase())
    return symbols.includes(symbolIn) && symbols.includes(symbolOut)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Abstract methods (implement in provider)
  // ─────────────────────────────────────────────────────────────────────────────

  abstract supportedChainIds(): SupportedChainId[]

  protected abstract _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction>

  protected abstract _getPrice(params: SwapPriceParams): Promise<SwapPrice>

  protected abstract _getMarket(
    params: GetSwapMarketParams,
  ): Promise<SwapMarket>

  protected abstract _getMarkets(
    params: GetSwapMarketsParams,
  ): Promise<SwapMarket[]>
}
