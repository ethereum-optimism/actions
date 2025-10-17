import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
  GetWalletResponse,
} from '@eth-optimism/actions-service'
import type {
  LendMarketPosition,
  SupportedChainId,
  TokenBalance,
  LendMarket,
  LendTransactionReceipt,
} from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

import { env } from '../envVars.js'
import type {
  LendExecutePositionParams,
  MarketResponse,
  PositionResponse,
  TransactionResponse,
} from '../types/index.js'
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

  async createWallet(
    userId: string,
    headers: HeadersInit = {},
  ): Promise<CreateWalletResponse> {
    return this.request<CreateWalletResponse>(`/wallet/${userId}`, {
      method: 'POST',
      headers,
    })
  }

  async getWallet(
    userId: string,
    headers: HeadersInit = {},
  ): Promise<GetWalletResponse> {
    return this.request<GetWalletResponse>(`/wallet/${userId}`, {
      method: 'GET',
      headers,
    })
  }

  async getAllWallets(
    headers: HeadersInit = {},
  ): Promise<GetAllWalletsResponse> {
    return this.request<GetAllWalletsResponse>('/wallets', {
      method: 'GET',
      headers,
    })
  }

  async getMarkets(
    headers: HeadersInit = {},
  ): Promise<{ markets: MarketResponse[] }> {
    return this.request('/lend/markets', {
      method: 'GET',
      headers,
    })
  }

  async getMarketsV1(headers: HeadersInit = {}): Promise<LendMarket[]> {
    const { result } = await this.request<{ result: Serialized<LendMarket[]> }>(
      '/v1/lend/markets',
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

  async getWalletBalance(
    userId: string,
    headers: HeadersInit = {},
  ): Promise<{
    balance: Array<{
      symbol: string
      totalBalance: string
      totalFormattedBalance: string
      chainBalances: Array<{
        chainId: number
        balance: string
        tokenAddress: Address
        formattedBalance: string
      }>
    }>
  }> {
    return this.request(`/wallet/${userId}/balance`, {
      method: 'GET',
      headers,
    })
  }

  async getWalletBalanceV1(headers: HeadersInit = {}): Promise<TokenBalance[]> {
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

  async fundWallet(
    userId: string,
    headers: HeadersInit = {},
  ): Promise<{
    success: boolean
    to: string
    amount: string
    transactionHashes?: Address[]
    userOpHash?: Address
    blockExplorerUrls?: string[]
  }> {
    return this.request(`/wallet/${userId}/fund`, {
      method: 'POST',
      headers,
    })
  }

  async sendTokens(
    walletId: string,
    amount: number,
    recipientAddress: string,
    headers: HeadersInit = {},
  ): Promise<{
    transaction: {
      to: string
      value: string
      data: string
    }
  }> {
    return this.request('/wallet/send', {
      method: 'POST',
      body: JSON.stringify({
        walletId,
        amount,
        recipientAddress,
      }),
      headers,
    })
  }

  async getPosition(
    marketId: { chainId: number; address: Address },
    walletId: string,
  ): Promise<PositionResponse> {
    return this.request(
      `/lend/market/${marketId.chainId}/${marketId.address}/position/${walletId}`,
      {
        method: 'GET',
      },
    )
  }

  async getPositionV1(
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

  async openLendPositionV1(
    { amount, asset, marketId }: LendExecutePositionParams,
    headers: HeadersInit = {},
  ): Promise<LendTransactionReceipt> {
    const { result } = await this.request<{ result: LendTransactionReceipt }>(
      '/v1/lend/position/open',
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

  async openLendPosition(
    walletId: string,
    amount: number,
    tokenAddress: Address,
    marketId: { chainId: number; address: Address },
    headers: HeadersInit = {},
  ): Promise<{ transaction: TransactionResponse }> {
    return this.request('/lend/position/open', {
      method: 'POST',
      body: JSON.stringify({
        walletId,
        amount,
        tokenAddress,
        marketId,
      }),
      headers,
    })
  }

  async closeLendPositionV1(
    { amount, asset, marketId }: LendExecutePositionParams,
    headers: HeadersInit = {},
  ): Promise<LendTransactionReceipt> {
    const { result } = await this.request<{ result: LendTransactionReceipt }>(
      '/v1/lend/position/close',
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
    walletId: string,
    amount: number,
    tokenAddress: Address,
    marketId: { chainId: number; address: Address },
    headers: HeadersInit = {},
  ): Promise<{ transaction: TransactionResponse }> {
    return this.request('/lend/position/close', {
      method: 'POST',
      body: JSON.stringify({
        walletId,
        amount,
        tokenAddress,
        marketId,
      }),
      headers,
    })
  }
}

export const actionsApi = new ActionsApiClient()
export { ActionsApiError }
