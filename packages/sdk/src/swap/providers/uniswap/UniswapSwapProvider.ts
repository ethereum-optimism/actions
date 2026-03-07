import { type Address, encodeAbiParameters, formatUnits, keccak256 } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { SwapProvider } from '@/swap/core/SwapProvider.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  ResolvedSwapParams,
  SwapMarket,
  SwapPrice,
  SwapPriceParams,
  SwapTransaction,
} from '@/types/swap/index.js'
import type { TransactionData } from '@/types/transaction.js'
import {
  getAssetAddress,
  isNativeAsset,
  parseAssetAmount,
} from '@/utils/assets.js'
import {
  buildPermit2ApprovalTx,
  buildTokenApprovalTx,
  checkPermit2Allowance,
  checkTokenAllowance,
} from '@/utils/permit2.js'

import { POOL_KEY_ABI_TYPE } from './abis.js'
import { getSupportedChainIds, getUniswapAddresses } from './addresses.js'
import { encodeUniversalRouterSwap, getQuote } from './encoding.js'
import type { UniswapMarketFilter, UniswapSwapProviderConfig } from './types.js'

/**
 * Uniswap swap provider using Universal Router
 * @description Routes swaps through V4 pools via the Uniswap Universal Router.
 * Uses Permit2 for token approvals.
 */
export class UniswapSwapProvider extends SwapProvider<UniswapSwapProviderConfig> {
  supportedChainIds(): SupportedChainId[] {
    return getSupportedChainIds()
  }

  protected async _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction> {
    const { chainId, assetIn, assetOut, walletAddress } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    const filter = this.resolveUniswapFilter(assetIn, assetOut, chainId)

    // Get quote first for price info
    const quote = await getQuote({
      assetIn,
      assetOut,
      amountInWei: params.amountInWei,
      amountOutWei: params.amountOutWei,
      chainId,
      publicClient,
      quoterAddress: addresses.quoter,
      poolManagerAddress: addresses.poolManager,
      fee: filter.fee,
      tickSpacing: filter.tickSpacing,
    })

    // Build the swap calldata
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
      fee: filter.fee,
      tickSpacing: filter.tickSpacing,
    })

    // Determine if approvals are needed (not for native ETH input)
    let tokenApproval: TransactionData | undefined
    let permit2Approval: TransactionData | undefined

    if (!isNativeAsset(assetIn)) {
      const assetInAddress = getAssetAddress(assetIn, chainId)
      const requiredAmount = params.amountInWei ?? quote.amountInWei

      // Check both allowances in parallel
      const [tokenAllowance, permit2Allowance] = await Promise.all([
        checkTokenAllowance({
          publicClient,
          token: assetInAddress,
          owner: walletAddress,
          spender: addresses.permit2,
        }),
        checkPermit2Allowance({
          publicClient,
          permit2Address: addresses.permit2,
          owner: walletAddress,
          token: assetInAddress,
          spender: addresses.universalRouter,
        }),
      ])

      if (tokenAllowance < requiredAmount) {
        tokenApproval = buildTokenApprovalTx(assetInAddress, addresses.permit2)
      }

      // Permit2 expiration is in Unix seconds (matching EVM block.timestamp)
      const permit2Expired =
        permit2Allowance.expiration < Math.floor(Date.now() / 1000)
      if (permit2Allowance.amount < requiredAmount || permit2Expired) {
        permit2Approval = buildPermit2ApprovalTx({
          permit2Address: addresses.permit2,
          token: assetInAddress,
          spender: addresses.universalRouter,
          amount: requiredAmount,
          expirySeconds: this._config.permit2ExpirySeconds,
        })
      }
    }

    // Build swap transaction
    const swapTx: TransactionData = {
      to: addresses.universalRouter,
      data: swapCalldata,
      value: isNativeAsset(assetIn) ? (params.amountInWei ?? 0n) : 0n,
    }

    const amountInWei = params.amountInWei ?? quote.amountInWei
    const amountOutWei = quote.amountOutWei

    return {
      amountIn: parseFloat(formatUnits(amountInWei, assetIn.metadata.decimals)),
      amountOut: parseFloat(
        formatUnits(amountOutWei, assetOut.metadata.decimals),
      ),
      amountInWei,
      amountOutWei,
      assetIn,
      assetOut,
      price: quote.price,
      priceImpact: quote.priceImpact,
      transactionData: {
        tokenApproval,
        permit2Approval,
        swap: swapTx,
      },
    }
  }

  protected async _getPrice(params: SwapPriceParams): Promise<SwapPrice> {
    const { chainId, assetIn, assetOut } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    if (!assetOut) {
      throw new Error('assetOut is required')
    }

    const filter = this.resolveUniswapFilter(assetIn, assetOut, chainId)

    const amountInWei = parseAssetAmount({
      amount: params.amountIn ?? 1,
      decimals: assetIn.metadata.decimals,
    })

    const amountOutWei =
      params.amountOut !== undefined
        ? parseAssetAmount({
            amount: params.amountOut,
            decimals: assetOut.metadata.decimals,
          })
        : undefined

    return getQuote({
      assetIn,
      assetOut,
      amountInWei: amountOutWei ? undefined : amountInWei,
      amountOutWei,
      chainId,
      publicClient,
      quoterAddress: addresses.quoter,
      poolManagerAddress: addresses.poolManager,
      fee: filter.fee,
      tickSpacing: filter.tickSpacing,
    })
  }

  protected async _getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    const { poolId, chainId } = params

    for (const filter of this.validFilters()) {
      if (filter.chainId !== undefined && filter.chainId !== chainId) continue
      const match = this.marketsFromFilter(filter, chainId).find(
        (m) => m.marketId.poolId === poolId,
      )
      if (match) return match
    }

    throw new Error(
      `Market with poolId ${poolId} not found on chain ${chainId}`,
    )
  }

  /**
   * Expands the market allowlist into concrete SwapMarket objects.
   * Derives poolId from each asset pair's pool key — no RPC calls needed.
   */
  protected async _getMarkets(
    params: GetSwapMarketsParams,
  ): Promise<SwapMarket[]> {
    return this.validFilters().flatMap((filter) => {
      const chainIds = params.chainId
        ? [params.chainId]
        : filter.chainId
          ? [filter.chainId]
          : this.supportedChainIds()

      return chainIds.flatMap((chainId) =>
        this.marketsFromFilter(filter, chainId, params.asset),
      )
    })
  }

  /**
   * Resolve and validate Uniswap-specific market filter with required fee/tickSpacing
   */
  private resolveUniswapFilter(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): UniswapMarketFilter & { fee: number; tickSpacing: number } {
    const filter = this.resolveMarketFilter(assetIn, assetOut, chainId) as
      | UniswapMarketFilter
      | undefined
    if (filter?.fee === undefined || filter?.tickSpacing === undefined) {
      throw new Error(
        `fee and tickSpacing must be configured for pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol}`,
      )
    }
    return filter as UniswapMarketFilter & { fee: number; tickSpacing: number }
  }

  /** Filters from allowlist that have required fee/tickSpacing */
  private validFilters(): Array<
    UniswapMarketFilter & {
      fee: number
      tickSpacing: number
    }
  > {
    return (this._config.marketAllowlist ?? []).filter(
      (f): f is UniswapMarketFilter & { fee: number; tickSpacing: number } =>
        f.fee !== undefined && f.tickSpacing !== undefined,
    )
  }

  /** Generate all pair-based markets from a filter on a given chain */
  private marketsFromFilter(
    filter: UniswapMarketFilter & { fee: number; tickSpacing: number },
    chainId: SupportedChainId,
    asset?: Asset,
  ): SwapMarket[] {
    return this.assetPairs(filter.assets, asset)
      .map(([a, b]) =>
        this.filterToMarket(a, b, chainId, filter.fee, filter.tickSpacing),
      )
      .filter((m): m is SwapMarket => m !== null)
  }

  /** Unique pairs from an asset list, optionally filtered to pairs containing a specific asset */
  private assetPairs(
    assets: Asset[],
    filterAsset?: Asset,
  ): Array<[Asset, Asset]> {
    return assets
      .flatMap((a, i) => assets.slice(i + 1).map((b): [Asset, Asset] => [a, b]))
      .filter(
        ([a, b]) => !filterAsset || a === filterAsset || b === filterAsset,
      )
  }

  /** Build a SwapMarket from two assets + pool params. Returns null if assets lack addresses on this chain. */
  private filterToMarket(
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

    // Sort tokens for deterministic poolId (V4 requires currency0 < currency1)
    const [currency0, currency1] =
      addrA.toLowerCase() < addrB.toLowerCase()
        ? [addrA, addrB]
        : [addrB, addrA]

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
