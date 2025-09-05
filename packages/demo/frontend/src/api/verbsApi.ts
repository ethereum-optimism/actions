import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
} from '@eth-optimism/verbs-service'
import { env } from '../envVars'

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

  async createWallet(userId: string, authToken?: string): Promise<CreateWalletResponse> {
    const headers: Record<string, string> = {}
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`
    }
    
    return this.request<CreateWalletResponse>(`/wallet/${userId}`, {
      method: 'POST',
      headers,
    })
  }

  async getWallet(userId: string): Promise<{ address: string; userId: string }> {
    return this.request<{ address: string; userId: string }>(`/wallet/${userId}`, {
      method: 'GET',
    })
  }

  async getAllWallets(): Promise<GetAllWalletsResponse> {
    return this.request<GetAllWalletsResponse>('/wallets', {
      method: 'GET',
    })
  }

  async getVaults(): Promise<{ vaults: Array<{ 
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
    return this.request('/lend/vaults', {
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

  async getWalletBalance(userId: string): Promise<{
    balance: Array<{
      symbol: string
      totalBalance: string
      totalFormattedBalance: string
      chainBalances: Array<{
        chainId: number
        balance: string
        formattedBalance: string
      }>
    }>
  }> {
    return this.request(`/wallet/${userId}/balance`, {
      method: 'GET',
    })
  }

  async fundWallet(userId: string, tokenType: string = 'USDC'): Promise<{ success: boolean, tokenType: string, to: string, amount: bigint }> {
    return this.request(`/wallet/${userId}/fund`, {
      method: 'POST',
      body: JSON.stringify({ tokenType }),
    })
  }

  async sendTokens(
    walletId: string,
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
        walletId,
        amount,
        recipientAddress,
      }),
    })
  }

  async getVaultBalance(vaultAddress: string, walletId: string): Promise<{
    balance: string
    balanceFormatted: string
    shares: string
    sharesFormatted: string
  }> {
    return this.request(`/lend/vault/${vaultAddress}/balance/${walletId}`, {
      method: 'GET',
    })
  }

  async lendDeposit(walletId: string, amount: number, token: string, chainId: number): Promise<{
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
      body: JSON.stringify({ walletId, amount, token, chainId }),
    })
  }
}

export const verbsApi = new VerbsApiClient()
export { VerbsApiError }
