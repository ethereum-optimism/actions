import type { Address } from 'viem'

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

import {
  getSubgraphUrl,
  getSupportedChainIds,
  getUniswapAddresses,
} from './addresses.js'
import { encodeUniversalRouterSwap, getQuote } from './sdk.js'
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
      const requiredAmount = params.amountInWei ?? quote.amountIn

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

    return {
      amountIn: params.amountInWei ?? quote.amountIn,
      amountOut: quote.amountOut,
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
      fee: filter.fee,
      tickSpacing: filter.tickSpacing,
    })
  }

  protected async _getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    const { poolId, chainId } = params
    const subgraphUrl = getSubgraphUrl(chainId)

    if (!subgraphUrl) {
      throw new Error(`Subgraph not available for chain ${chainId}`)
    }

    const query = `
      query GetPool($id: ID!) {
        pool(id: $id) {
          id
          token0 { id, symbol, decimals }
          token1 { id, symbol, decimals }
          feeTier
          totalValueLockedUSD
          volumeUSD
        }
      }
    `

    const response = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { id: poolId },
      }),
    })

    const data = (await response.json()) as {
      data: { pool: SubgraphPool | null }
    }
    if (!data.data.pool) {
      throw new Error(
        `Market with poolId ${poolId} not found on chain ${chainId}`,
      )
    }

    return this.transformSubgraphMarket(data.data.pool, chainId)
  }

  protected async _getMarkets(
    params: GetSwapMarketsParams,
  ): Promise<SwapMarket[]> {
    const chainIds = params.chainId
      ? [params.chainId]
      : this.supportedChainIds()

    const results = await Promise.all(
      chainIds.map((chainId) =>
        this.fetchMarketsForChain(chainId, params.asset),
      ),
    )

    return results.flat()
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

  private async fetchMarketsForChain(
    chainId: SupportedChainId,
    asset?: Asset,
  ): Promise<SwapMarket[]> {
    const subgraphUrl = getSubgraphUrl(chainId)
    if (!subgraphUrl) return []

    const query = `
      query GetPools($first: Int!, $skip: Int!, $where: Pool_filter) {
        pools(first: $first, skip: $skip, where: $where, orderBy: totalValueLockedUSD, orderDirection: desc) {
          id
          token0 { id, symbol, decimals }
          token1 { id, symbol, decimals }
          feeTier
          totalValueLockedUSD
          volumeUSD
        }
      }
    `

    const where = asset
      ? {
          or: [
            { token0_: { symbol: asset.metadata.symbol } },
            { token1_: { symbol: asset.metadata.symbol } },
          ],
        }
      : undefined

    const response = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { first: 100, skip: 0, where },
      }),
    })

    const data = (await response.json()) as { data: { pools: SubgraphPool[] } }
    return data.data.pools.map((pool) =>
      this.transformSubgraphMarket(pool, chainId),
    )
  }

  private transformSubgraphMarket(
    pool: SubgraphPool,
    chainId: SupportedChainId,
  ): SwapMarket {
    return {
      marketId: {
        poolId: pool.id,
        chainId,
      },
      assets: [
        this.tokenToAsset(pool.token0, chainId),
        this.tokenToAsset(pool.token1, chainId),
      ],
      fee: Number(pool.feeTier),
      tvl: BigInt(Math.floor(parseFloat(pool.totalValueLockedUSD) * 1e6)),
      volume24h: BigInt(Math.floor(parseFloat(pool.volumeUSD) * 1e6)),
      provider: 'uniswap',
    }
  }

  private tokenToAsset(
    token: { id: string; symbol: string; decimals: string },
    chainId: SupportedChainId,
  ): Asset {
    return {
      type: 'erc20',
      address: { [chainId]: token.id as Address },
      metadata: {
        name: token.symbol,
        symbol: token.symbol,
        decimals: Number(token.decimals),
      },
    }
  }
}

interface SubgraphPool {
  id: string
  token0: { id: string; symbol: string; decimals: string }
  token1: { id: string; symbol: string; decimals: string }
  feeTier: string
  totalValueLockedUSD: string
  volumeUSD: string
}
