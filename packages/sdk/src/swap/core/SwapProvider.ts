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
import { parseAssetAmount } from '@/utils/assets.js'
import {
  validateAmountPositiveIfExists,
  validateAmountProvided,
  validateAssetOnChain,
  validateChainSupported,
  validateNotBothAmounts,
  validateNotSameAsset,
  validateNotZeroAddress,
  validateSlippage,
} from '@/utils/validation.js'

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
    this.executeValidations(params)
    const resolvedParams = this.resolveParams(params)
    validateSlippage(resolvedParams.slippage, MAX_SLIPPAGE)
    return this._execute(resolvedParams)
  }

  /** Get price quote for a swap */
  async getPrice(params: SwapPriceParams): Promise<SwapPrice> {
    validateChainSupported(params.chainId, this.supportedChainIds())
    return this._getPrice(params)
  }

  /** Get a specific swap market by ID */
  async getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    validateChainSupported(params.chainId, this.supportedChainIds())
    return this._getMarket(params)
  }

  /** Get available swap markets, optionally filtered by chainId or asset */
  async getMarkets(params: GetSwapMarketsParams = {}): Promise<SwapMarket[]> {
    if (params.chainId) {
      validateChainSupported(params.chainId, this.supportedChainIds())
    }
    return this._getMarkets(params)
  }

  isChainSupported(chainId: SupportedChainId): boolean {
    return this.supportedChainIds().includes(chainId)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Protected helpers
  // ─────────────────────────────────────────────────────────────────────────────

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

  private executeValidations(
    params: SwapExecuteParams & {
      walletAddress: Address
      chainId: SupportedChainId
    },
  ): void {
    validateAmountProvided(params.amountIn, params.amountOut)
    validateAmountPositiveIfExists(params.amountIn)
    validateAmountPositiveIfExists(params.amountOut)
    validateNotBothAmounts(params.amountIn, params.amountOut)
    validateNotSameAsset(params.assetIn, params.assetOut)
    validateNotZeroAddress(params.walletAddress, 'walletAddress')
    if (params.recipient) {
      validateNotZeroAddress(params.recipient, 'recipient')
    }
    validateChainSupported(params.chainId, this.supportedChainIds())
    this.validateMarketAllowed(params.assetIn, params.assetOut, params.chainId)
    validateAssetOnChain(params.assetIn, params.chainId)
    validateAssetOnChain(params.assetOut, params.chainId)
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
