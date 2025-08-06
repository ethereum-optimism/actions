import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
} from '@eth-optimism/verbs-sdk'
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
    
    console.log('=== API REQUEST START ===')
    console.log('URL:', url)
    console.log('Method:', options.method || 'GET')
    console.log('Headers:', {
      'Content-Type': 'application/json',
      ...options.headers,
    })
    console.log('Body:', options.body)
    console.log('=== API REQUEST END ===')

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    console.log('=== API RESPONSE START ===')
    console.log('Status:', response.status)
    console.log('Status Text:', response.statusText)
    console.log('Response OK:', response.ok)

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`

      try {
        const errorData = await response.json()
        console.log('Error Response Data:', errorData)
        errorMessage = errorData.error || errorData.message || errorMessage
      } catch {
        // If JSON parsing fails, use the default error message
      }

      console.log('=== API RESPONSE END (ERROR) ===')
      throw new VerbsApiError(errorMessage, response.status)
    }

    const data = await response.json()
    console.log('Success Response Data:', data)
    console.log('=== API RESPONSE END (SUCCESS) ===')
    return data
  }

  async createWallet(userId: string): Promise<CreateWalletResponse> {
    return this.request<CreateWalletResponse>(`/wallet/${userId}`, {
      method: 'POST',
    })
  }

  async getAllWallets(): Promise<GetAllWalletsResponse> {
    return this.request<GetAllWalletsResponse>('/wallets', {
      method: 'GET',
    })
  }

  async getVaults(): Promise<{ vaults: Array<{ 
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
    asset: string,
    recipientAddress: string,
  ): Promise<{
    transaction: {
      to: string
      value: string
      data: string
    }
  }> {
    const requestBody = {
      walletId,
      amount,
      asset,
      recipientAddress,
    }
    
    console.log('API sendTokens - Making request to /wallet/send with body:', requestBody)
    
    return this.request('/wallet/send', {
      method: 'POST',
      body: JSON.stringify(requestBody),
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

  async lendDeposit(walletId: string, amount: number, token: string): Promise<{
    transaction: {
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
      body: JSON.stringify({ walletId, amount, token }),
    })
  }
}

export const verbsApi = new VerbsApiClient()
export { VerbsApiError }
