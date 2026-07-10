import type {
  Asset,
  LendMarketPosition,
  SupportedChainId,
  SwapMarket,
  SwapQuote,
  TokenBalance,
  LendMarket,
  LendTransactionReceipt,
} from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

interface GetWalletResponse {
  address: Address
}

import type { LendExecutePositionParams } from '../types/index.js'
import type { Serialized } from '../util/serialize.js'
import {
  ActionsApiError,
  BaseApiClient,
  MUTATION_TIMEOUT_MS,
} from './apiClient.js'

class ActionsApiClient extends BaseApiClient {
  async getWallet(headers: HeadersInit = {}): Promise<GetWalletResponse> {
    return this.request<GetWalletResponse>(`/wallet`, {
      method: 'GET',
      headers,
    })
  }

  async getMarkets(headers: HeadersInit = {}): Promise<LendMarket[]> {
    const { result } = await this.request<{ result: Serialized<LendMarket[]> }>(
      '/lend/markets',
      {
        method: 'GET',
        headers,
      },
    )
    return result.map((market) => ({
      ...market,
      supply: {
        ...market.supply,
        totalShares: BigInt(market.supply.totalShares),
        totalAssets: BigInt(market.supply.totalAssets),
      },
    }))
  }

  async getWalletBalance(headers: HeadersInit = {}): Promise<TokenBalance[]> {
    const { result } = await this.request<{
      result: Serialized<TokenBalance>[]
    }>('/wallet/balance', {
      method: 'GET',
      headers,
    })
    return result.map((balance) => ({
      ...balance,
      totalBalanceRaw: BigInt(balance.totalBalanceRaw),
      chains: Object.fromEntries(
        Object.entries(balance.chains).map(([chainId, chainBalance]) => [
          chainId,
          chainBalance
            ? { ...chainBalance, balanceRaw: BigInt(chainBalance.balanceRaw) }
            : chainBalance,
        ]),
      ),
    })) as TokenBalance[]
  }

  async mintDemoUsdcToWallet(headers: HeadersInit = {}): Promise<{
    success: boolean
    to: string
    amount: string
    transactionHashes?: Address[]
    userOpHash?: Address
    blockExplorerUrls?: string[]
  }> {
    return this.request(`/wallet/usdc`, {
      method: 'POST',
      headers,
      timeoutMs: MUTATION_TIMEOUT_MS,
    })
  }

  async getPosition(
    {
      marketId,
    }: {
      marketId: { chainId: SupportedChainId; address: Address }
    },
    headers: HeadersInit = {},
  ): Promise<LendMarketPosition> {
    const { result } = await this.request<{
      result: Serialized<LendMarketPosition>
    }>(`/wallet/lend/${marketId.chainId}/${marketId.address}/position`, {
      method: 'GET',
      headers,
    })
    return {
      ...result,
      balance: BigInt(result.balance),
      shares: BigInt(result.shares),
    }
  }

  async getPositions(
    params: {
      chainId?: SupportedChainId
      options?: { nonZeroOnly?: boolean }
    } = {},
    headers: HeadersInit = {},
  ): Promise<LendMarketPosition[]> {
    const search = new URLSearchParams()
    if (params.chainId !== undefined)
      search.set('chainId', String(params.chainId))
    if (params.options?.nonZeroOnly) search.set('nonZeroOnly', 'true')
    const qs = search.toString()
    const { result } = await this.request<{
      result: Serialized<LendMarketPosition>[]
    }>(`/wallet/lend/positions${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers,
    })
    return result.map((position) => ({
      ...position,
      balance: BigInt(position.balance),
      shares: BigInt(position.shares),
    }))
  }

  private async lendMutation(
    action: 'open' | 'close',
    { amount, asset, marketId }: LendExecutePositionParams,
    headers: HeadersInit,
  ): Promise<LendTransactionReceipt> {
    const { result } = await this.request<{ result: LendTransactionReceipt }>(
      `/lend/position/${action}`,
      {
        method: 'POST',
        body: JSON.stringify({
          amount,
          tokenAddress: asset.address[marketId.chainId],
          marketId,
        }),
        headers,
        timeoutMs: MUTATION_TIMEOUT_MS,
      },
    )
    return result
  }

  async openLendPosition(
    params: LendExecutePositionParams,
    headers: HeadersInit = {},
  ): Promise<LendTransactionReceipt> {
    return this.lendMutation('open', params, headers)
  }

  async closeLendPosition(
    params: LendExecutePositionParams,
    headers: HeadersInit = {},
  ): Promise<LendTransactionReceipt> {
    return this.lendMutation('close', params, headers)
  }

  async dripEthToWallet(
    walletAddress: Address,
  ): Promise<{ userOpHash: string }> {
    const { result } = await this.request<{
      result: { userOpHash: string }
    }>('/wallet/eth', {
      method: 'POST',
      body: JSON.stringify({
        walletAddress,
      }),
      timeoutMs: MUTATION_TIMEOUT_MS,
    })
    return result
  }

  async getAssets(headers: HeadersInit = {}): Promise<Asset[]> {
    const { result } = await this.request<{
      result: Asset[]
    }>('/assets', {
      method: 'GET',
      headers,
    })
    return result
  }

  async getSwapMarkets(
    chainId?: SupportedChainId,
    headers: HeadersInit = {},
  ): Promise<SwapMarket[]> {
    const params = chainId ? `?chainId=${chainId}` : ''
    const { result } = await this.request<{
      result: Serialized<SwapMarket>[]
    }>(`/swap/markets${params}`, {
      method: 'GET',
      headers,
    })
    return result.map((market) => ({
      ...market,
      tvl: market.tvl ? BigInt(market.tvl) : undefined,
      volume24h: market.volume24h ? BigInt(market.volume24h) : undefined,
    }))
  }

  async getSwapQuote(
    {
      tokenInAddress,
      tokenOutAddress,
      chainId,
      amountIn,
      amountOut,
      provider,
    }: {
      tokenInAddress: Address
      tokenOutAddress: Address
      chainId: SupportedChainId
      amountIn?: number
      amountOut?: number
      provider?: string
    },
    headers: HeadersInit = {},
  ) {
    const params = new URLSearchParams({
      tokenInAddress,
      tokenOutAddress,
      chainId: chainId.toString(),
    })
    if (amountIn !== undefined) {
      params.set('amountIn', amountIn.toString())
    }
    if (amountOut !== undefined) {
      params.set('amountOut', amountOut.toString())
    }
    if (provider) {
      params.set('provider', provider)
    }

    const { result } = await this.request<{
      result: Serialized<SwapQuote>
    }>(`/swap/quote?${params}`, {
      method: 'GET',
      headers,
    })
    return {
      ...result,
      amountIn: Number(result.amountIn),
      amountOut: Number(result.amountOut),
      amountInRaw: BigInt(result.amountInRaw),
      amountOutRaw: BigInt(result.amountOutRaw),
      amountOutMinRaw: BigInt(result.amountOutMinRaw),
      gasEstimate: result.gasEstimate ? BigInt(result.gasEstimate) : undefined,
    }
  }

  async executeSwap(
    params: {
      amountIn: number
      tokenInAddress: Address
      tokenOutAddress: Address
      chainId: SupportedChainId
      slippage?: number
      provider?: string
    },
    headers: HeadersInit = {},
  ): Promise<{
    amountIn: number
    amountOut: number
    price: string
    priceImpact: number
    blockExplorerUrls?: string[]
  }> {
    const {
      amountIn,
      tokenInAddress,
      tokenOutAddress,
      chainId,
      slippage,
      provider,
    } = params
    const { result } = await this.request<{
      result: {
        amountIn: string
        amountOut: string
        price: string
        priceImpact: number
        blockExplorerUrls?: string[]
      }
    }>('/swap/execute', {
      method: 'POST',
      body: JSON.stringify({
        amountIn,
        tokenInAddress,
        tokenOutAddress,
        chainId,
        slippage,
        provider,
      }),
      headers,
      timeoutMs: MUTATION_TIMEOUT_MS,
    })
    return {
      amountIn: Number(result.amountIn),
      amountOut: Number(result.amountOut),
      price: result.price,
      priceImpact: result.priceImpact,
      blockExplorerUrls: result.blockExplorerUrls,
    }
  }
}

export const actionsApi = new ActionsApiClient()
export { ActionsApiError }
