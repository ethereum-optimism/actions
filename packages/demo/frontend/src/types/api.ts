/**
 * API response types for frontend
 * @description Types matching backend API responses with serialized values
 */

import type { Asset, LendMarketId } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

export interface MarketResponse {
  marketId: {
    chainId: number
    address: Address
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
  transactionHashes?: string[]
  userOpHash?: string
  blockExplorerUrls: string[]
  amount: number
  tokenAddress: string
  marketId: {
    chainId: number
    address: Address
  }
}

export interface LendExecutePositionParams {
  /** Asset to withdraw (optional - will be validated against marketId) */
  asset: Asset
  /** Amount to withdraw (in wei) */
  amount: number
  /** Market identifier containing address and chainId */
  marketId: LendMarketId
}
