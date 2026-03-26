import { type Address, encodeAbiParameters, formatUnits, keccak256 } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { SwapProvider } from '@/swap/core/SwapProvider.js'
import { POOL_KEY_ABI_TYPE } from '@/swap/providers/uniswap/abis.js'
import {
  getSupportedChainIds,
  getUniswapAddresses,
} from '@/swap/providers/uniswap/addresses.js'
import {
  encodeUniversalRouterSwap,
  getQuote,
} from '@/swap/providers/uniswap/encoding.js'
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
import type { TransactionData } from '@/types/transaction.js'
import { isNativeAsset, parseAssetAmount } from '@/utils/assets.js'

/**
 * Uniswap V4 swap provider using Universal Router and Permit2 approvals.
 */
export class UniswapSwapProvider extends SwapProvider<UniswapSwapProviderConfig> {
  /**
   * @returns Chain IDs where Uniswap V4 contracts are deployed
   */
  protocolSupportedChainIds(): SupportedChainId[] {
    return getSupportedChainIds()
  }

  /**
   * Build a swap transaction from raw parameters.
   * Delegates to _getQuote then _executeFromQuote to avoid duplicating logic.
   * @param params - Resolved swap parameters (amounts as raw bigint, defaults applied)
   * @returns Transaction data ready for wallet execution
   */
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
    return this._executeFromQuote(swapQuote)
  }

  /**
   * Execute a swap from a pre-built quote.
   * Uses the pre-encoded calldata from the quote but builds fresh Permit2 approval transactions.
   * @param quote - A SwapQuote previously returned by _getQuote
   * @returns Transaction data with approvals and swap calldata
   */
  protected async _executeFromQuote(
    quote: SwapQuote,
  ): Promise<SwapTransaction> {
    const { chainId, assetIn, assetOut, execution } = quote
    const addresses = getUniswapAddresses(chainId)

    const walletAddress =
      '0x0000000000000000000000000000000000000001' as Address

    const { tokenApproval, permit2Approval } = await this.buildPermit2Approvals(
      {
        assetIn,
        assetOut,
        slippage: quote.slippage,
        deadline: quote.deadline,
        recipient: walletAddress,
        walletAddress,
        chainId,
        amountInRaw: quote.amountInRaw,
      },
      quote.amountInRaw,
      addresses.permit2,
      addresses.universalRouter,
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
      transactionData: { tokenApproval, permit2Approval, swap: swapTx },
    }
  }

  /**
   * Get a full swap quote with pricing, slippage bounds, and pre-built execution data.
   * Supports both exact-input and exact-output swaps.
   * @param params - Quote parameters (assets, amounts, chain, slippage, deadline)
   * @returns SwapQuote with amounts, price, route, and encoded calldata
   * @throws If the asset pair is not in the market allowlist
   */
  protected async _getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    const { chainId, assetIn, assetOut } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)
    const marketConfig = this.resolveUniswapConfig(assetIn, assetOut, chainId)

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

    const swapCalldata = encodeUniversalRouterSwap({
      amountInRaw: amountOutRaw ? undefined : amountInRaw,
      amountOutRaw,
      assetIn,
      assetOut,
      slippage,
      deadline,
      recipient:
        params.recipient ?? '0x0000000000000000000000000000000000000001',
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
    }
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Look up the Uniswap-specific market config for a pair.
   * @param assetIn - Input asset
   * @param assetOut - Output asset
   * @param chainId - Target chain
   * @returns Market config with guaranteed fee and tickSpacing
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

  /**
   * @returns Allowlist entries that have the required fee and tickSpacing set
   */
  private validConfigs(): Array<
    UniswapMarketConfig & { fee: number; tickSpacing: number }
  > {
    return (this._config.marketAllowlist ?? []).filter(
      (f): f is UniswapMarketConfig & { fee: number; tickSpacing: number } =>
        f.fee !== undefined && f.tickSpacing !== undefined,
    )
  }

  /**
   * Generate all SwapMarket objects from a single config entry on a given chain.
   * @param config - Market config with fee/tickSpacing
   * @param chainId - Target chain
   * @param asset - If provided, only return markets containing this asset
   * @returns Array of SwapMarket objects
   */
  private marketsFromConfig(
    config: UniswapMarketConfig & { fee: number; tickSpacing: number },
    chainId: SupportedChainId,
    asset?: Asset,
  ): SwapMarket[] {
    return this.assetPairs(config.assets, asset)
      .map(([a, b]) =>
        this.configToMarket(a, b, chainId, config.fee, config.tickSpacing),
      )
      .filter((m): m is SwapMarket => m !== null)
  }

  /**
   * Generate unique asset pairs, optionally filtered to pairs containing a required asset.
   * @param assets - Full list of assets from a market config
   * @param requiredAsset - If set, only pairs including this asset are returned
   * @returns Array of [assetA, assetB] tuples
   */
  private assetPairs(
    assets: Asset[],
    requiredAsset?: Asset,
  ): Array<[Asset, Asset]> {
    return assets
      .flatMap((a, i) => assets.slice(i + 1).map((b): [Asset, Asset] => [a, b]))
      .filter(
        ([a, b]) =>
          !requiredAsset || a === requiredAsset || b === requiredAsset,
      )
  }

  /**
   * Build a SwapMarket from two assets and V4 pool parameters.
   * Computes a deterministic poolId from the sorted pool key.
   * @param assetA - First asset in the pair
   * @param assetB - Second asset in the pair
   * @param chainId - Target chain
   * @param fee - Fee tier in pips
   * @param tickSpacing - Tick spacing for the pool
   * @returns SwapMarket, or null if either asset lacks an address on this chain
   */
  private configToMarket(
    assetA: Asset,
    assetB: Asset,
    chainId: SupportedChainId,
    fee: number,
    tickSpacing: number,
  ): SwapMarket | null {
    const addrA = assetA.address[chainId]
    const addrB = assetB.address[chainId]
    if (!addrA || addrA === 'native' || !addrB || addrB === 'native')
      return null

    const [currency0, currency1] =
      addrA.toLowerCase() < addrB.toLowerCase()
        ? [addrA, addrB]
        : [addrB, addrA]

    // V4 requires currency0 < currency1 for deterministic pool keys
    // PoolId = keccak256(abi.encode(PoolKey)) per V4's PoolIdLibrary
    // @see https://github.com/Uniswap/v4-core/blob/main/src/types/PoolId.sol
    const poolId = keccak256(
      encodeAbiParameters(POOL_KEY_ABI_TYPE, [
        currency0 as Address,
        currency1 as Address,
        fee,
        tickSpacing,
        '0x0000000000000000000000000000000000000000' as Address,
      ]),
    )

    return {
      marketId: { poolId, chainId },
      assets: [assetA, assetB],
      fee,
      provider: 'uniswap',
    }
  }
}
