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
}

export const actionsApi = new ActionsApiClient()
export { ActionsApiError }
