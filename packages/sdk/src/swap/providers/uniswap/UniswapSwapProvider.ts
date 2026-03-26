import { formatUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  expandMarkets,
  findMarket,
  UNIVERSAL_ROUTER_MSG_SENDER,
} from '@/swap/core/markets.js'
import { SwapProvider } from '@/swap/core/SwapProvider.js'
import {
  getSupportedChainIds,
  getUniswapAddresses,
} from '@/swap/providers/uniswap/addresses.js'
import {
  encodeUniversalRouterSwap,
  getQuote,
} from '@/swap/providers/uniswap/encoding.js'
import {
  configToMarkets,
  getValidMarketConfigs,
} from '@/swap/providers/uniswap/markets.js'
import type {
  UniswapMarketConfig,
  UniswapSwapProviderConfig,
} from '@/swap/providers/uniswap/types.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  ResolvedSwapParams,
  SwapMarket,
  SwapQuote,
  SwapQuoteParams,
  SwapTransaction,
} from '@/types/swap/index.js'
import { isNativeAsset, parseAssetAmount } from '@/utils/assets.js'

/**
 * Uniswap V4 swap provider using Universal Router and Permit2 approvals.
 */
export class UniswapSwapProvider extends SwapProvider<UniswapSwapProviderConfig> {
  protocolSupportedChainIds(): SupportedChainId[] {
    return getSupportedChainIds()
  }

  protected async _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction> {
    const swapQuote = await this._getQuote({
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      amountIn: params.amountInRaw
        ? parseFloat(
            formatUnits(params.amountInRaw, params.assetIn.metadata.decimals),
          )
        : undefined,
      amountOut: params.amountOutRaw
        ? parseFloat(
            formatUnits(params.amountOutRaw, params.assetOut.metadata.decimals),
          )
        : undefined,
      chainId: params.chainId,
      slippage: params.slippage,
      deadline: params.deadline,
      recipient: params.recipient,
    })
    return this.buildSwapTransactions(swapQuote)
  }

  protected async _buildApprovals(quote: SwapQuote) {
    const addresses = getUniswapAddresses(quote.chainId)

    return this.buildPermit2Approvals(
      {
        assetIn: quote.assetIn,
        assetOut: quote.assetOut,
        slippage: quote.slippage,
        deadline: quote.deadline,
        recipient: quote.recipient!,
        walletAddress: quote.recipient!,
        chainId: quote.chainId,
        amountInRaw: quote.amountInRaw,
      },
      quote.amountInRaw,
      addresses.permit2,
      addresses.universalRouter,
    )
  }

  protected async _getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    const { chainId, assetIn, assetOut } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)
    const marketConfig = this.resolveUniswapConfig(assetIn, assetOut, chainId)

    // Default to 1 unit for price quotes when no amount specified
    const amountInRaw = parseAssetAmount(assetIn, params.amountIn ?? 1)
    const amountOutRaw = parseAssetAmount(assetOut, params.amountOut)
    const slippage = params.slippage ?? this.defaultSlippage
    const now = Math.floor(Date.now() / 1000)
    const deadline = params.deadline ?? now + this.quoteExpirationSeconds

    const quote = await getQuote({
      assetIn,
      assetOut,
      amountInRaw: amountOutRaw ? undefined : amountInRaw,
      amountOutRaw,
      chainId,
      publicClient,
      quoterAddress: addresses.quoter,
      poolManagerAddress: addresses.poolManager,
      fee: marketConfig.fee,
      tickSpacing: marketConfig.tickSpacing,
    })

    const recipient = params.recipient ?? UNIVERSAL_ROUTER_MSG_SENDER

    const swapCalldata = encodeUniversalRouterSwap({
      amountInRaw: amountOutRaw ? undefined : amountInRaw,
      amountOutRaw,
      assetIn,
      assetOut,
      slippage,
      deadline,
      recipient,
      chainId,
      quote,
      universalRouterAddress: addresses.universalRouter,
      fee: marketConfig.fee,
      tickSpacing: marketConfig.tickSpacing,
    })

    const finalAmountInRaw = amountOutRaw ? quote.amountInRaw : amountInRaw

    const slippageBps = BigInt(Math.round(slippage * 10000))
    const amountOutMinRaw =
      (quote.amountOutRaw * (10000n - slippageBps)) / 10000n
    const amountOutMin = parseFloat(
      formatUnits(amountOutMinRaw, assetOut.metadata.decimals),
    )

    return {
      assetIn,
      assetOut,
      chainId,
      amountIn: quote.amountIn,
      amountInRaw: finalAmountInRaw,
      amountOut: quote.amountOut,
      amountOutRaw: quote.amountOutRaw,
      amountOutMin,
      amountOutMinRaw,
      price: quote.amountOut / quote.amountIn,
      priceInverse: quote.amountIn / quote.amountOut,
      priceImpact: quote.priceImpact,
      route: quote.route,
      execution: {
        swapCalldata,
        routerAddress: addresses.universalRouter,
        value: isNativeAsset(assetIn) ? (amountInRaw ?? 0n) : 0n,
        providerContext: {
          fee: marketConfig.fee,
          tickSpacing: marketConfig.tickSpacing,
          permit2Address: addresses.permit2,
        },
      },
      provider: 'uniswap',
      slippage,
      deadline,
      quotedAt: now,
      expiresAt: deadline,
      gasEstimate: quote.gasEstimate,
      quotedRecipient: recipient,
    }
  }

  /**
   * Find a specific market by poolId from the allowlist.
   * @param params - Pool ID and chain to look up
   * @returns Matching market
   * @throws If no matching market found in config
   */
  protected async _getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    return findMarket(
      getValidMarketConfigs(this._config.marketAllowlist),
      params.chainId,
      params.poolId,
      configToMarkets,
    )
  }

  /**
   * Expand the market allowlist into concrete SwapMarket objects.
   * @param params - Optional filters (chainId, asset)
   * @returns All configured markets matching the filters
   */
  protected async _getMarkets(
    params: GetSwapMarketsParams,
  ): Promise<SwapMarket[]> {
    return expandMarkets({
      configs: getValidMarketConfigs(this._config.marketAllowlist),
      filters: params,
      supportedChainIds: this.supportedChainIds(),
      toMarkets: configToMarkets,
    })
  }

  /**
   * Resolve and validate Uniswap market config for a pair.
   * @throws If pair not in allowlist or missing fee/tickSpacing
   */
  private resolveUniswapConfig(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): UniswapMarketConfig & { fee: number; tickSpacing: number } {
    const config = this.resolveMarketConfig(assetIn, assetOut, chainId) as
      | UniswapMarketConfig
      | undefined
    if (config?.fee === undefined || config?.tickSpacing === undefined) {
      throw new Error(
        `fee and tickSpacing must be configured for pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol}`,
      )
    }
    return config as UniswapMarketConfig & { fee: number; tickSpacing: number }
  }
}
