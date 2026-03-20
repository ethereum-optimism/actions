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
  SwapPrice,
  SwapPriceParams,
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
  /** @returns Chain IDs where Uniswap V4 contracts are deployed */
  supportedChainIds(): SupportedChainId[] {
    return getSupportedChainIds()
  }

  /**
   * Build a swap transaction with quote, calldata, and any required approvals.
   * @param params - Resolved swap parameters (amounts in wei, defaults applied)
   * @returns Transaction data ready for wallet execution
   */
  protected async _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction> {
    const { chainId, assetIn, assetOut } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)
    const marketConfig = this.resolveUniswapConfig(assetIn, assetOut, chainId)

    const quote = await getQuote({
      assetIn,
      assetOut,
      amountInWei: params.amountInWei,
      amountOutWei: params.amountOutWei,
      chainId,
      publicClient,
      quoterAddress: addresses.quoter,
      poolManagerAddress: addresses.poolManager,
      fee: marketConfig.fee,
      tickSpacing: marketConfig.tickSpacing,
    })

    const swapCalldata = encodeUniversalRouterSwap({
      amountInWei: params.amountInWei,
      amountOutWei: params.amountOutWei,
      assetIn,
      assetOut,
      slippage: params.slippage,
      deadline: params.deadline,
      recipient: params.recipient,
      chainId,
      quote,
      universalRouterAddress: addresses.universalRouter,
      fee: marketConfig.fee,
      tickSpacing: marketConfig.tickSpacing,
    })

    const amountInWei = params.amountInWei ?? quote.amountInWei
    const { tokenApproval, permit2Approval } = await this.buildPermit2Approvals(
      params,
      amountInWei,
      addresses.permit2,
      addresses.universalRouter,
      this._config.permit2ExpirySeconds,
    )

    const swapTx: TransactionData = {
      to: addresses.universalRouter,
      data: swapCalldata,
      value: isNativeAsset(assetIn) ? (params.amountInWei ?? 0n) : 0n,
    }

    return {
      amountIn: parseFloat(formatUnits(amountInWei, assetIn.metadata.decimals)),
      amountOut: parseFloat(
        formatUnits(quote.amountOutWei, assetOut.metadata.decimals),
      ),
      amountInWei,
      amountOutWei: quote.amountOutWei,
      assetIn,
      assetOut,
      price: quote.price,
      priceImpact: quote.priceImpact,
      transactionData: { tokenApproval, permit2Approval, swap: swapTx },
    }
  }

  /**
   * Get a price quote for a swap pair.
   * @param params - Price query with assets, optional amounts, and chain
   * @returns Quote with price, amounts, price impact, and route
   */
  protected async _getPrice(params: SwapPriceParams): Promise<SwapPrice> {
    const { chainId, assetIn, assetOut } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    if (!assetOut) {
      throw new Error('assetOut is required')
    }

    const marketConfig = this.resolveUniswapConfig(assetIn, assetOut, chainId)

    // Default to 1 unit for price quotes when no amount specified
    const amountInWei = parseAssetAmount(assetIn, params.amountIn ?? 1)
    const amountOutWei = parseAssetAmount(assetOut, params.amountOut)

    return getQuote({
      assetIn,
      assetOut,
      amountInWei: amountOutWei ? undefined : amountInWei,
      amountOutWei,
      chainId,
      publicClient,
      quoterAddress: addresses.quoter,
      poolManagerAddress: addresses.poolManager,
      fee: marketConfig.fee,
      tickSpacing: marketConfig.tickSpacing,
    })
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
   * Derives poolId from each asset pair's pool key — no RPC calls needed.
   * @param params - Optional chain and asset filters
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
   * Get a full swap quote with pre-built execution data.
   */
  protected async _getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    const { chainId, assetIn, assetOut } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)
    const marketConfig = this.resolveUniswapConfig(assetIn, assetOut, chainId)

    const amountInWei = parseAssetAmount(assetIn, params.amountIn ?? 1)
    const amountOutWei = parseAssetAmount(assetOut, params.amountOut)
    const slippage = params.slippage ?? this.defaultSlippage
    const now = Math.floor(Date.now() / 1000)
    const deadline = params.deadline ?? now + 60

    const quote = await getQuote({
      assetIn,
      assetOut,
      amountInWei: amountOutWei ? undefined : amountInWei,
      amountOutWei,
      chainId,
      publicClient,
      quoterAddress: addresses.quoter,
      poolManagerAddress: addresses.poolManager,
      fee: marketConfig.fee,
      tickSpacing: marketConfig.tickSpacing,
    })

    const swapCalldata = encodeUniversalRouterSwap({
      amountInWei: amountOutWei ? undefined : amountInWei,
      amountOutWei,
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

    const finalAmountInWei = amountOutWei ? quote.amountInWei : amountInWei

    return {
      assetIn,
      assetOut,
      amountIn: params.amountIn,
      amountOut: params.amountOut,
      chainId,
      slippage,
      deadline,
      recipient: params.recipient,
      provider: 'uniswap',
      price: quote,
      execution: {
        swapCalldata,
        routerAddress: addresses.universalRouter,
        amountInWei: finalAmountInWei,
        amountOutMinWei: quote.amountOutWei,
        value: isNativeAsset(assetIn) ? (amountInWei ?? 0n) : 0n,
        chainId,
        deadline,
        providerContext: {
          fee: marketConfig.fee,
          tickSpacing: marketConfig.tickSpacing,
          permit2Address: addresses.permit2,
        },
      },
      quotedAt: now,
      expiresAt: deadline,
    }
  }

  /**
   * Execute a swap from a pre-built quote.
   * Uses pre-encoded calldata but builds fresh approval transactions.
   */
  protected async _executeFromQuote(
    quote: SwapQuote,
  ): Promise<SwapTransaction> {
    const { chainId, assetIn, assetOut } = quote
    const { execution } = quote
    const addresses = getUniswapAddresses(chainId)

    // Build fresh approvals using the walletAddress from recipient
    // For quote-based execution, we need a walletAddress for permit2 checks.
    // The recipient in the quote is used as the wallet address for approval checks.
    const walletAddress =
      quote.recipient ?? '0x0000000000000000000000000000000000000001'

    const { tokenApproval, permit2Approval } = await this.buildPermit2Approvals(
      {
        assetIn,
        assetOut,
        slippage: quote.slippage ?? this.defaultSlippage,
        deadline: execution.deadline,
        recipient: walletAddress,
        walletAddress,
        chainId,
        amountInWei: execution.amountInWei,
      },
      execution.amountInWei,
      addresses.permit2,
      addresses.universalRouter,
      this._config.permit2ExpirySeconds,
    )

    const swapTx: TransactionData = {
      to: execution.routerAddress,
      data: execution.swapCalldata,
      value: execution.value,
    }

    return {
      amountIn: quote.price.amountIn,
      amountOut: quote.price.amountOut,
      amountInWei: execution.amountInWei,
      amountOutWei: quote.price.amountOutWei,
      assetIn,
      assetOut,
      price: quote.price.price,
      priceImpact: quote.price.priceImpact,
      transactionData: { tokenApproval, permit2Approval, swap: swapTx },
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Look up the Uniswap-specific market config for a pair, validating fee/tickSpacing.
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

  /** @returns Allowlist entries that have the required fee and tickSpacing set */
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
   * Generate unique asset pairs, optionally scoped to pairs containing a required asset.
   * @param assets - Full list of assets from a market config
   * @param requiredAsset - If set, only pairs including this asset are returned
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

    // V4 requires currency0 < currency1 for deterministic pool keys
    const [currency0, currency1] =
      addrA.toLowerCase() < addrB.toLowerCase()
        ? [addrA, addrB]
        : [addrB, addrA]

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
