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

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
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

  async createWallet(): Promise<CreateWalletResponse> {
    return this.request<CreateWalletResponse>(`/wallet`, {
      method: 'POST',
    })
  }

  async getAllWallets(): Promise<GetAllWalletsResponse> {
    return this.request<GetAllWalletsResponse>('/wallets', {
      method: 'GET',
    })
  }

  async getMarkets(): Promise<{ markets: Array<{ 
    chainId: number;
    address: string; 
    name: string; 
    apy: number; 
    asset: string;
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
  }> }> {
    return this.request('/lend/markets', {
      method: 'GET',
    })
  }

  async getVault(vaultAddress: string): Promise<{
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
    })
  }

  async getWalletBalance(walletAddress: Address): Promise<{
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
    return this.request(`/wallet/${walletAddress}/balance`, {
      method: 'GET',
    })
  }

  async fundWallet(walletAddress: Address): Promise<{ success: boolean, to: string, amount: bigint }> {
    return this.request(`/wallet/${walletAddress}/fund`, {
      method: 'POST',
    })
  }

  async sendTokens(
    walletAddress: Address,
    amount: number,
    recipientAddress: string,
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
        walletAddress,
        amount,
        recipientAddress,
      }),
    })
  }

  async getMarketBalance(vaultAddress: string, walletAddress: string): Promise<{
    balance: string
    balanceFormatted: string
    shares: string
    sharesFormatted: string
  }> {
    return this.request(`/lend/market/${vaultAddress}/balance/${walletAddress}`, {
      method: 'GET',
    })
  }

  async lendDeposit(walletAddress: Address, amount: number, tokenAddress: Address, chainId: number): Promise<{
    transaction: {
      blockExplorerUrl: string
      hash: string
      amount: string
      asset: string
      marketId: string
      apy: number
      timestamp: number
      slippage: number
      transactionData: {
        approval?: {
          to: string
          data: string
          value: string
        }
        deposit: {
          to: string
          data: string
          value: string
        }
      }
    }
  }> {
    return this.request('/lend/deposit', {
      method: 'POST',
      body: JSON.stringify({ walletAddress, amount, tokenAddress, chainId }),
    })
  }
}

export const verbsApi = new VerbsApiClient()
export { VerbsApiError }
