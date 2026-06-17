import { formatUnits } from 'viem'

import { expandMarkets, findMarket } from '@/actions/swap/core/markets.js'
import { SwapProvider } from '@/actions/swap/core/SwapProvider.js'
import {
  getSupportedChainIds,
  getUniswapAddresses,
} from '@/actions/swap/providers/uniswap/addresses.js'
import {
  buildPath,
  encodeUniversalRouterSwap,
  getQuote,
  type MultiHopParams,
} from '@/actions/swap/providers/uniswap/encoding.js'
import {
  configToMarkets,
  getValidMarketConfigs,
} from '@/actions/swap/providers/uniswap/markets.js'
import type {
  UniswapMarketConfig,
  UniswapSwapProviderConfig,
} from '@/actions/swap/providers/uniswap/types.js'
import { UNISWAP } from '@/constants/providers.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { AssetMetadataRequiredError } from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { SwapQuoteParamsResolved } from '@/services/nameservices/ens/types.js'
import type { SwapSettings } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  ResolvedSwapParams,
  SwapMarket,
  SwapQuote,
  SwapTransaction,
} from '@/types/swap/index.js'
import { resolveApprovalMode } from '@/utils/approve.js'
import { isNativeAsset, parseAssetAmount } from '@/utils/assets.js'

/**
 * Uniswap V4 swap provider using Universal Router and Permit2 approvals.
 */
export class UniswapSwapProvider extends SwapProvider<UniswapSwapProviderConfig> {
  constructor(
    config: UniswapSwapProviderConfig,
    chainManager: ChainManager,
    settings?: SwapSettings,
  ) {
    super(config, chainManager, settings)
  }

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
    return this.buildSwapTransactions({
      ...swapQuote,
      approvalMode: params.approvalMode,
    })
  }

  protected async _buildApprovals(quote: SwapQuote) {
    const addresses = getUniswapAddresses(quote.chainId)

    return this.buildPermit2Approvals(
      {
        assetIn: quote.assetIn,
        assetOut: quote.assetOut,
        slippage: quote.slippage,
        deadline: quote.deadline,
        recipient: quote.recipient,
        walletAddress: quote.recipient,
        chainId: quote.chainId,
        amountInRaw: quote.amountInRaw,
        approvalMode: resolveApprovalMode(
          quote.approvalMode,
          this._config.approvalMode,
          this._settings.approvalMode,
        ),
      },
      quote.amountInRaw,
      addresses.permit2,
      addresses.universalRouter,
    )
  }

  protected async _getQuote(
    params: SwapQuoteParamsResolved,
  ): Promise<SwapQuote> {
    const { chainId, assetIn, assetOut } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)
    const marketConfig = this.resolveUniswapConfig(assetIn, assetOut, chainId)

    const { slippage, now, deadline, recipient, amountInRaw } =
      this.resolveQuoteDefaults(params)
    const amountOutRaw = parseAssetAmount(assetOut, params.amountOut)

    const multiHop: MultiHopParams | undefined =
      marketConfig.path && marketConfig.path.length >= 2
        ? buildPath(marketConfig.assets[0], marketConfig.path)
        : undefined

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
      multiHop,
    })

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
      multiHop,
    })

    const finalAmountInRaw = amountOutRaw ? quote.amountInRaw : amountInRaw

    const { amountOutMinRaw, amountOutMin } = this.computeSlippageBounds(
      quote.amountOutRaw,
      slippage,
      assetOut,
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
          fee: marketConfig.fee ?? marketConfig.path?.[0]?.fee,
          tickSpacing:
            marketConfig.tickSpacing ?? marketConfig.path?.[0]?.tickSpacing,
          permit2Address: addresses.permit2,
        },
      },
      provider: UNISWAP,
      slippage,
      deadline,
      quotedAt: now,
      expiresAt: deadline,
      gasEstimate: quote.gasEstimate,
      recipient,
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
   * A pair must define either a direct pool (`fee` + `tickSpacing`) or a
   * multi-hop `path` (2+ hops).
   * @throws If pair not in allowlist or missing both pool params and a path
   */
  private resolveUniswapConfig(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): UniswapMarketConfig {
    const config = this.resolveMarketConfig(assetIn, assetOut, chainId) as
      | UniswapMarketConfig
      | undefined

    const hasDirectPool =
      config?.fee !== undefined && config?.tickSpacing !== undefined
    const hasPath = (config?.path?.length ?? 0) >= 2

    if (!config || (!hasDirectPool && !hasPath)) {
      throw new AssetMetadataRequiredError(
        `fee and tickSpacing (or a multi-hop path) must be configured for pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol}`,
      )
    }
    return config
  }
}
