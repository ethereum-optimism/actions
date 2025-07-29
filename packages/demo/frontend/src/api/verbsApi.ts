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
        errorMessage = errorData.message || errorMessage
      } catch {
        // If JSON parsing fails, use the default error message
      }

      throw new VerbsApiError(errorMessage, response.status)
    }

    const data = await response.json()
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

  async getVaults(): Promise<{ vaults: Array<{ address: string; name: string; apy: number; asset: string }> }> {
    return this.request<{ vaults: Array<{ address: string; name: string; apy: number; asset: string }> }>('/lend/vaults', {
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
      depositCapacity: string
      withdrawalCapacity: string
      lastUpdate: number
    }
  }> {
    return this.request(`/lend/vault/${vaultAddress}`, {
      method: 'GET',
    })
  }
}

export const verbsApi = new VerbsApiClient()
export { VerbsApiError }
