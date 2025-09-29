import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
} from '@eth-optimism/verbs-service'
import { env } from '../envVars'
import type { Address } from 'viem'

class VerbsApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'VerbsApiError'
    this.status = status
  }
}

class VerbsApiClient {
  private baseUrl = env.VITE_VERBS_API_URL

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

      throw new VerbsApiError(errorMessage, response.status)
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

  async getAllWallets(
    headers: HeadersInit = {},
  ): Promise<GetAllWalletsResponse> {
    return this.request<GetAllWalletsResponse>('/wallets', {
      method: 'GET',
      headers,
    })
  }

  async getMarkets(headers: HeadersInit = {}): Promise<{
    markets: Array<{
      chainId: number
      address: string
      name: string
      apy: number
      asset: string
      apyBreakdown: {
        nativeApy: number
        totalRewardsApr: number
        usdc?: number
        morpho?: number
        other?: number
        performanceFee: number
        netApy: number
      }
      totalAssets: string
      totalShares: string
      fee: number
      owner: string
      curator: string
      lastUpdate: number
    }>
  }> {
    return this.request('/lend/markets', {
      method: 'GET',
      headers,
    })
  }

  async getVault(
    vaultAddress: string,
    headers: HeadersInit = {},
  ): Promise<{
    vault: {
      address: string
      name: string
      asset: string
      apy: number
      apyBreakdown: {
        nativeApy: number
        totalRewardsApr: number
        usdc?: number
        morpho?: number
        other?: number
        performanceFee: number
        netApy: number
      }
      totalAssets: string
      totalShares: string
      fee: number
      owner: string
      curator: string
      lastUpdate: number
    }
  }> {
    return this.request(`/lend/vault/${vaultAddress}`, {
      method: 'GET',
      headers,
    })
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

  async fundWallet(
    userId: string,
    headers: HeadersInit = {},
  ): Promise<{ success: boolean; to: string; amount: bigint }> {
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

  async getMarketBalance(
    vaultAddress: string,
    walletId: string,
  ): Promise<{
    balance: string
    balanceFormatted: string
    shares: string
    sharesFormatted: string
  }> {
    return this.request(`/lend/market/${vaultAddress}/balance/${walletId}`, {
      method: 'GET',
    })
  }

  async openLendPosition(
    walletId: string,
    amount: number,
    tokenAddress: Address,
    chainId: number,
    vaultAddress: Address,
    headers: HeadersInit = {},
  ): Promise<{
    transaction: {
      hash: string
      blockExplorerUrl: string
      amount: number
      tokenAddress: string
      chainId: number
      vaultAddress: string
    }
  }> {
    return this.request('/lend/open-position', {
      method: 'POST',
      body: JSON.stringify({ walletId, amount, tokenAddress, chainId, vaultAddress }),
      headers,
    })
  }

  async closeLendPosition(
    walletId: string,
    amount: number,
    tokenAddress: Address,
    chainId: number,
    vaultAddress: Address,
    headers: HeadersInit = {},
  ): Promise<{
    transaction: {
      hash: string
      blockExplorerUrl: string
      amount: number
      tokenAddress: string
      chainId: number
      vaultAddress: string
    }
  }> {
    return this.request(`/lend/${vaultAddress}/${chainId}/close`, {
      method: 'POST',
      body: JSON.stringify({ walletId, amount, tokenAddress }),
      headers,
    })
  }
}

export const verbsApi = new VerbsApiClient()
export { VerbsApiError }
