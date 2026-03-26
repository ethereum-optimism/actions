import { formatUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { SwapProvider } from '@/swap/core/SwapProvider.js'
import {
  getChainConfig,
  getSupportedChainIds,
  getValidMarketConfigs,
} from '@/swap/providers/velodrome/config.js'
import {
  buildTokenApproval,
  encodePoolSwap,
  fetchPoolQuote,
} from '@/swap/providers/velodrome/encoding/index.js'
import {
  assetPairs,
  configToMarket,
  resolvePoolConfig,
} from '@/swap/providers/velodrome/markets.js'
import type {
  VelodromeMarketConfig,
  VelodromeSwapProviderConfig,
} from '@/swap/providers/velodrome/types.js'
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
import type { TransactionData } from '@/types/transaction.js'
import {
  getAssetAddress,
  isNativeAsset,
  parseAssetAmount,
} from '@/utils/assets.js'

/**
 * Velodrome/Aerodrome swap provider for OP Stack chains.
 * Supports v2 AMM pools, CL/Slipstream concentrated liquidity pools,
 * v2 routers (Optimism, Base), leaf routers (Relay chains), and Universal Router (Base Sepolia).
 */
export class VelodromeSwapProvider extends SwapProvider<VelodromeSwapProviderConfig> {
  /** @returns Chain IDs where Velodrome/Aerodrome contracts are deployed */
  protocolSupportedChainIds(): SupportedChainId[] {
    return getSupportedChainIds()
  }

  /**
   * Build a swap transaction from raw parameters.
   * Delegates to _getQuote then _executeFromQuote to avoid duplicating logic.
   * @param params - Resolved swap parameters (amounts as raw bigint, defaults applied)
   * @returns Transaction data ready for wallet execution
   * @throws If amountOut is provided (Velodrome only supports exact-input swaps)
   */
  protected async _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction> {
    if (params.amountOutRaw !== undefined) {
      throw new Error(
        'Velodrome/Aerodrome does not support exact-output swaps. Provide amountIn instead of amountOut.',
      )
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
    })
    return this._executeFromQuote(swapQuote)
  }

  /**
   * Find a specific market by poolId from the allowlist.
   * @param params - Pool ID and chain to look up
   * @returns Matching market
   * @throws If no matching market found in config
   */
  protected async _getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    const { poolId, chainId } = params

    for (const config of this.validConfigs()) {
      if (config.chainId !== undefined && config.chainId !== chainId) continue
      const match = this.marketsFromConfig(config, chainId).find(
        (m) => m.marketId.poolId === poolId,
      )
      if (match) return match
    }

    throw new Error(
      `Market with poolId ${poolId} not found on chain ${chainId}`,
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
    return this.validConfigs().flatMap((config) => {
      const chainIds = params.chainId
        ? [params.chainId]
        : config.chainId
          ? [config.chainId]
          : this.supportedChainIds()

      return chainIds.flatMap((chainId) =>
        this.marketsFromConfig(config, chainId, params.asset),
      )
    })
  }

  /**
   * Get a full swap quote with pricing, slippage bounds, and pre-built execution data.
   * @param params - Quote parameters (assets, amounts, chain, slippage, deadline)
   * @returns SwapQuote with amounts, price, route, and encoded calldata
   * @throws If amountOut is provided (Velodrome only supports exact-input)
   */
  protected async _getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    const { chainId, assetIn, assetOut } = params

    if (params.amountOut !== undefined) {
      throw new Error(
        'Velodrome/Aerodrome does not support exact-output swaps. Provide amountIn instead of amountOut.',
      )
    }

    const chain = getChainConfig(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)
    const poolConfig = this.resolveVelodromeConfig(assetIn, assetOut, chainId)

    const amountInRaw = parseAssetAmount(assetIn, params.amountIn ?? 1)
    const slippage = params.slippage ?? this.defaultSlippage
    const now = Math.floor(Date.now() / 1000)
    const deadline = params.deadline ?? now + this.quoteExpirationSeconds
    const recipient =
      params.recipient ?? '0x0000000000000000000000000000000000000001'

    const { internalQuote, providerContext } = await fetchPoolQuote(
      poolConfig,
      { assetIn, assetOut, amountInRaw, chainId, publicClient, chain },
    )

    const amountOutMinRaw =
      (internalQuote.amountOutRaw *
        BigInt(Math.round((1 - slippage) * 10000))) /
      10000n
    const amountOutMin = parseFloat(
      formatUnits(amountOutMinRaw, assetOut.metadata.decimals),
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
      provider: 'velodrome',
      slippage,
      deadline,
      quotedAt: now,
      expiresAt: deadline,
      gasEstimate: internalQuote.gasEstimate,
    }
  }

  /**
   * Execute a swap from a pre-built quote.
   * @param quote - A SwapQuote previously returned by _getQuote
   * @returns Transaction data with approvals and swap calldata
   */
  protected async _executeFromQuote(
    quote: SwapQuote,
  ): Promise<SwapTransaction> {
    const { chainId, assetIn, assetOut, execution } = quote
    const chain = getChainConfig(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    const tokenApproval = isNativeAsset(assetIn)
      ? undefined
      : await buildTokenApproval(
          getAssetAddress(assetIn, chainId),
          chain.contracts.router,
          chain.metadata.routerType,
          quote.amountInRaw,
          publicClient,
        )

    const swapTx: TransactionData = {
      to: execution.routerAddress,
      data: execution.swapCalldata,
      value: execution.value,
    }

    return {
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
      amountInRaw: quote.amountInRaw,
      amountOutRaw: quote.amountOutRaw,
      assetIn,
      assetOut,
      price: quote.price,
      priceImpact: quote.priceImpact,
      transactionData: {
        tokenApproval,
        swap: swapTx,
      },
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers (require `this` access)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Resolve market config to a discriminated pool config.
   * @throws If pair not in allowlist, or has both/neither stable and tickSpacing
   */
  private resolveVelodromeConfig(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ) {
    const config = this.resolveMarketConfig(assetIn, assetOut, chainId) as
      | VelodromeMarketConfig
      | undefined
    if (!config) {
      throw new Error(
        `No market config for pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol}`,
      )
    }
    return resolvePoolConfig(config)
  }

  /** @returns Allowlist entries that have either stable or tickSpacing set */
  private validConfigs(): VelodromeMarketConfig[] {
    return (this._config.marketAllowlist ?? []).filter(
      (f) => f.stable !== undefined || f.tickSpacing !== undefined,
    )
  }

  /** Generate all SwapMarket objects from a single config entry on a given chain. */
  private marketsFromConfig(
    config: VelodromeMarketConfig,
    chainId: SupportedChainId,
    asset?: Asset,
  ): SwapMarket[] {
    const poolCfg = resolvePoolConfig(config)
    return assetPairs(config.assets, asset)
      .map(([a, b]) => configToMarket(a, b, chainId, poolCfg))
      .filter((m): m is SwapMarket => m !== null)
  }
}
