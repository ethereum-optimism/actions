import { formatUnits } from 'viem'

import { expandMarkets, findMarket } from '@/actions/swap/core/markets.js'
import { SwapProvider } from '@/actions/swap/core/SwapProvider.js'
import {
  getChainConfig,
  getSupportedChainIds,
  getValidMarketConfigs,
} from '@/actions/swap/providers/velodrome/config.js'
import {
  encodePoolSwap,
  fetchPoolQuote,
} from '@/actions/swap/providers/velodrome/encoding/index.js'
import {
  configToMarkets,
  resolvePoolConfig,
} from '@/actions/swap/providers/velodrome/markets.js'
import type {
  VelodromeMarketConfig,
  VelodromeSwapProviderConfig,
} from '@/actions/swap/providers/velodrome/types.js'
import { VELODROME } from '@/constants/providers.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  ExactOutputNotSupportedError,
  MarketNotAllowedError,
} from '@/core/error/errors.js'
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
import {
  buildErc20ApprovalTx,
  checkTokenAllowance,
  resolveApprovalMode,
  resolveErc20ApprovalAmount,
} from '@/utils/approve.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

/**
 * Velodrome/Aerodrome swap provider for OP Stack chains.
 * Supports v2 AMM pools, CL/Slipstream concentrated liquidity pools,
 * v2 routers (Optimism, Base), leaf routers (Relay chains), and Universal Router (Base Sepolia).
 */
export class VelodromeSwapProvider extends SwapProvider<VelodromeSwapProviderConfig> {
  constructor(
    config: VelodromeSwapProviderConfig,
    chainManager: ChainManager,
    settings?: SwapSettings,
  ) {
    super(config, chainManager, settings)
  }

  /** @returns Chain IDs where Velodrome/Aerodrome contracts are deployed */
  protocolSupportedChainIds(): SupportedChainId[] {
    return getSupportedChainIds()
  }

  /**
   * Build a swap transaction from raw parameters.
   * @param params - Resolved swap parameters (amounts as raw bigint, defaults applied)
   * @returns Transaction data ready for wallet execution
   * @throws If amountOut is provided (Velodrome only supports exact-input swaps)
   */
  protected async _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction> {
    if (params.amountOutRaw !== undefined) {
      throw new ExactOutputNotSupportedError('Velodrome/Aerodrome')
    }

    const swapQuote = await this._getQuote({
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      amountIn: params.amountInRaw
        ? parseFloat(
            formatUnits(params.amountInRaw, params.assetIn.metadata.decimals),
          )
        : undefined,
      chainId: params.chainId,
      slippage: params.slippage,
      deadline: params.deadline,
      recipient: params.recipient,
      walletAddress: params.walletAddress,
    })
    return this.buildSwapTransactions({
      ...swapQuote,
      approvalMode: params.approvalMode,
    })
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
   * Get a full swap quote with pricing, slippage bounds, and pre-built execution data.
   * @param params - Quote parameters (assets, amounts, chain, slippage, deadline)
   * @returns SwapQuote with amounts, price, route, and encoded calldata
   * @throws If amountOut is provided (Velodrome only supports exact-input)
   */
  protected async _getQuote(
    params: SwapQuoteParamsResolved,
  ): Promise<SwapQuote> {
    const { chainId, assetIn, assetOut } = params

    if (params.amountOut !== undefined) {
      throw new ExactOutputNotSupportedError('Velodrome/Aerodrome')
    }

    const chain = getChainConfig(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)
    const poolConfig = this.resolveVelodromeMarketConfig(
      assetIn,
      assetOut,
      chainId,
    )
    const { slippage, now, deadline, recipient, walletAddress, amountInRaw } =
      this.resolveQuoteDefaults(params)

    const { internalQuote, providerContext } = await fetchPoolQuote(
      poolConfig,
      { assetIn, assetOut, amountInRaw, chainId, publicClient, chain },
    )

    const { amountOutMinRaw, amountOutMin } = this.computeSlippageBounds(
      internalQuote.amountOutRaw,
      slippage,
      assetOut,
    )

    const swapCalldata = encodePoolSwap(poolConfig, {
      assetIn,
      assetOut,
      amountInRaw,
      amountOutMinRaw,
      recipient,
      deadline,
      chainId,
      chain,
    })

    return {
      assetIn,
      assetOut,
      chainId,
      amountIn: internalQuote.amountIn,
      amountInRaw,
      amountOut: internalQuote.amountOut,
      amountOutRaw: internalQuote.amountOutRaw,
      amountOutMin,
      amountOutMinRaw,
      price: internalQuote.amountOut / internalQuote.amountIn,
      priceInverse: internalQuote.amountIn / internalQuote.amountOut,
      priceImpact: internalQuote.priceImpact,
      route: internalQuote.route,
      execution: {
        swapCalldata,
        routerAddress: chain.contracts.router,
        value: isNativeAsset(assetIn) ? amountInRaw : 0n,
        providerContext,
      },
      provider: VELODROME,
      slippage,
      deadline,
      quotedAt: now,
      expiresAt: deadline,
      gasEstimate: internalQuote.gasEstimate,
      recipient,
      walletAddress,
    }
  }

  protected async _buildApprovals(quote: SwapQuote) {
    if (isNativeAsset(quote.assetIn)) {
      return { tokenApproval: undefined }
    }

    const chain = getChainConfig(quote.chainId)
    const publicClient = this.chainManager.getPublicClient(quote.chainId)
    const token = getAssetAddress(quote.assetIn, quote.chainId)
    const spender = chain.contracts.router
    const required = quote.amountInRaw

    const allowance = await checkTokenAllowance({
      publicClient,
      token,
      owner: quote.walletAddress,
      spender,
    })

    if (allowance >= required) {
      return { tokenApproval: undefined }
    }

    const tokenApproval = buildErc20ApprovalTx({
      assetAddress: token,
      spender,
      amount: resolveErc20ApprovalAmount(
        resolveApprovalMode(
          quote.approvalMode,
          this._config.approvalMode,
          this._settings.approvalMode,
        ),
        required,
      ),
    })
    return { tokenApproval }
  }

  /**
   * Resolve market config to a discriminated pool config.
   * @throws If pair not in allowlist, or has both/neither stable and tickSpacing
   */
  private resolveVelodromeMarketConfig(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ) {
    const config = this.resolveMarketConfig(assetIn, assetOut, chainId) as
      | VelodromeMarketConfig
      | undefined
    if (!config) {
      throw new MarketNotAllowedError({
        assetInSymbol: assetIn.metadata.symbol,
        assetOutSymbol: assetOut.metadata.symbol,
        chainId,
        reason: 'No market config for this pair',
      })
    }
    return resolvePoolConfig(config)
  }
}
