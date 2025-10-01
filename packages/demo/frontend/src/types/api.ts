/**
 * API response types for frontend
 * @description Types matching backend API responses with serialized values
 */

export interface MarketResponse {
  marketId: {
    chainId: number
    address: string
  }
  name: string
  asset: {
    address: Record<number, string>
    metadata: {
      symbol: string
      name: string
      decimals: number
    }
    type: string
  }
  supply: {
    totalAssets: string
    totalShares: string
  }
  apy: {
    total: number
    native: number
    totalRewards: number
    performanceFee: number
    usdc?: number
    morpho?: number
    other?: number
  }
  metadata: {
    owner: string
    curator: string
    fee: number
    lastUpdate: number
  }
}

export interface PositionResponse {
  balance: string
  balanceFormatted: string
  shares: string
  sharesFormatted: string
}

export interface TransactionResponse {
  hash: string
  userOpHash?: string
  blockExplorerUrl: string
  amount: number
  tokenAddress: string
  chainId: number
  vaultAddress: string
}
