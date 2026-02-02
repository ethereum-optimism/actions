import type {
  LendMarketPosition,
  SupportedChainId,
  TokenBalance,
  LendMarket,
  LendTransactionReceipt,
} from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

interface GetWalletResponse {
  address: Address
}

import { env } from '../envVars.js'
import type { LendExecutePositionParams } from '../types/index.js'
import type { Serialized } from '../util/serialize.js'

class ActionsApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ActionsApiError'
    this.status = status
  }
}

class ActionsApiClient {
  private baseUrl = env.VITE_ACTIONS_API_URL

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const { headers, ...rest } = options

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      ...rest,
    })

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`

      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorData.message || errorMessage
      } catch {
        // If JSON parsing fails, use the default error message
      }

      throw new ActionsApiError(errorMessage, response.status)
    }

    const data = await response.json()
    return data
  }

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
      totalBalance: BigInt(balance.totalBalance),
      chainBalances: balance.chainBalances.map((chainBalance) => ({
        ...chainBalance,
        balance: BigInt(chainBalance.balance),
      })),
    }))
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

  async openLendPosition(
    { amount, asset, marketId }: LendExecutePositionParams,
    headers: HeadersInit = {},
  ): Promise<LendTransactionReceipt> {
    const { result } = await this.request<{ result: LendTransactionReceipt }>(
      '/lend/position/open',
      {
        method: 'POST',
        body: JSON.stringify({
          amount,
          tokenAddress: asset.address[marketId.chainId],
          marketId,
        }),
        headers,
      },
    )
    return result
  }

  async closeLendPosition(
    { amount, asset, marketId }: LendExecutePositionParams,
    headers: HeadersInit = {},
  ): Promise<LendTransactionReceipt> {
    const { result } = await this.request<{ result: LendTransactionReceipt }>(
      '/lend/position/close',
      {
        method: 'POST',
        body: JSON.stringify({
          amount,
          tokenAddress: asset.address[marketId.chainId],
          marketId,
        }),
        headers,
      },
    )
    return result
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
    })
    return result
  }

  async getSwapMarkets(
    chainId?: SupportedChainId,
    headers: HeadersInit = {},
  ): Promise<
    Array<{
      marketId: { poolId: string; chainId: number }
      assets: [unknown, unknown]
      fee: number
      tvl?: bigint
      volume24h?: bigint
      provider: string
    }>
  > {
    const params = chainId ? `?chainId=${chainId}` : ''
    const { result } = await this.request<{
      result: Array<{
        marketId: { poolId: string; chainId: number }
        assets: [unknown, unknown]
        fee: number
        tvl?: string
        volume24h?: string
        provider: string
      }>
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

  async getSwapPrice(
    {
      tokenInAddress,
      tokenOutAddress,
      chainId,
      amountIn,
    }: {
      tokenInAddress: Address
      tokenOutAddress: Address
      chainId: SupportedChainId
      amountIn?: number
    },
    headers: HeadersInit = {},
  ): Promise<{
    price: string
    priceInverse: string
    amountIn: bigint
    amountOut: bigint
    amountOutFormatted: string
    priceImpact: number
    gasEstimate?: bigint
  }> {
    const params = new URLSearchParams({
      tokenInAddress,
      tokenOutAddress,
      chainId: chainId.toString(),
    })
    if (amountIn !== undefined) {
      params.set('amountIn', amountIn.toString())
    }

    const { result } = await this.request<{
      result: {
        price: string
        priceInverse: string
        amountIn: string
        amountOut: string
        amountOutFormatted: string
        priceImpact: number
        gasEstimate?: string
      }
    }>(`/swap/price?${params}`, {
      method: 'GET',
      headers,
    })
    return {
      price: result.price,
      priceInverse: result.priceInverse,
      amountIn: BigInt(result.amountIn),
      amountOut: BigInt(result.amountOut),
      amountOutFormatted: result.amountOutFormatted,
      priceImpact: result.priceImpact,
      gasEstimate: result.gasEstimate ? BigInt(result.gasEstimate) : undefined,
    }
  }

  async executeSwap(
    {
      amountIn,
      tokenInAddress,
      tokenOutAddress,
      chainId,
      slippage,
    }: {
      amountIn: number
      tokenInAddress: Address
      tokenOutAddress: Address
      chainId: SupportedChainId
      slippage?: number
    },
    headers: HeadersInit = {},
  ): Promise<{
    amountIn: bigint
    amountOut: bigint
    price: string
    priceImpact: number
    blockExplorerUrls?: string[]
  }> {
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
      }),
      headers,
    })
    return {
      amountIn: BigInt(result.amountIn),
      amountOut: BigInt(result.amountOut),
      price: result.price,
      priceImpact: result.priceImpact,
      blockExplorerUrls: result.blockExplorerUrls,
    }
  }
}

export const actionsApi = new ActionsApiClient()
export { ActionsApiError }
