import type { Address } from 'viem'
import { parseUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { SwapProvider } from '@/swap/core/SwapProvider.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  SwapExecuteInternalParams,
  SwapMarket,
  SwapPrice,
  SwapPriceParams,
  SwapProviderConfig,
  SwapTransaction,
} from '@/types/swap/index.js'
import type { TransactionData } from '@/types/transaction.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

import {
  getSubgraphUrl,
  getSupportedChainIds,
  getUniswapAddresses,
} from './addresses.js'
import {
  buildPermit2ApprovalTx,
  buildTokenApprovalTx,
  checkPermit2Allowance,
  checkTokenAllowance,
} from './permit2.js'
import { encodeUniversalRouterSwap, getQuote } from './sdk.js'

/**
 * Uniswap swap provider using Universal Router
 * @description Routes swaps through V4 pools via the Uniswap Universal Router.
 * Uses Permit2 for token approvals.
 */
export class UniswapSwapProvider extends SwapProvider<SwapProviderConfig> {
  supportedChainIds(): SupportedChainId[] {
    return getSupportedChainIds()
  }

  protected async _execute(
    params: SwapExecuteInternalParams,
  ): Promise<SwapTransaction> {
    const { chainId, assetIn, assetOut, walletAddress } = params
    const addresses = getUniswapAddresses(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    const filter = this.resolveMarketFilter(assetIn, assetOut, chainId)
    if (!filter?.fee || !filter?.tickSpacing) {
      throw new Error(
        `fee and tickSpacing must be configured for pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol}`,
      )
    }

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

      // Check if token is approved to Permit2
      const tokenAllowance = await checkTokenAllowance({
        publicClient,
        token: assetInAddress,
        owner: walletAddress,
        spender: addresses.permit2,
      })

      if (tokenAllowance < requiredAmount) {
        tokenApproval = buildTokenApprovalTx(assetInAddress, addresses.permit2)
      }

      // Check Permit2 allowance to Universal Router
      const permit2Allowance = await checkPermit2Allowance({
        publicClient,
        permit2Address: addresses.permit2,
        owner: walletAddress,
        token: assetInAddress,
        spender: addresses.universalRouter,
      })

      if (permit2Allowance.amount < requiredAmount) {
        permit2Approval = buildPermit2ApprovalTx({
          permit2Address: addresses.permit2,
          token: assetInAddress,
          spender: addresses.universalRouter,
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

    const filter = this.resolveMarketFilter(assetIn, assetOut, chainId)
    if (!filter?.fee || !filter?.tickSpacing) {
      throw new Error(
        `fee and tickSpacing must be configured for pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol}`,
      )
    }

    // Default to 1 unit if no amount specified
    const amountInWei =
      params.amountIn !== undefined
        ? parseUnits(
            params.amountIn.toString(),
            assetIn.metadata.decimals,
          )
        : parseUnits('1', assetIn.metadata.decimals)

    const amountOutWei =
      params.amountOut !== undefined
        ? parseUnits(
            params.amountOut.toString(),
            assetOut.metadata.decimals,
          )
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
