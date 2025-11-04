import type {
  ApyBreakdown,
  Asset,
  LendMarketId,
  LendMarketMetadata,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

/**
 * Formatted market response for API
 * @description Market data with bigint values converted to strings for JSON serialization
 */
export interface FormattedMarketResponse {
  marketId: LendMarketId
  name: string
  asset: Asset
  supply: {
    totalAssets: string
    totalShares: string
  }
  apy: ApyBreakdown
  metadata: LendMarketMetadata
}

/**
 * Position parameters for opening/closing
 */
export interface PositionParams {
  idToken: string
  amount: number
  tokenAddress: Address
  marketId: LendMarketId
}

/**
 * Position operation response
 */
export interface PositionResponse {
  transactionHashes?: string[]
  userOpHash?: string
  blockExplorerUrls: string[]
  amount: number
  tokenAddress: Address
  marketId: LendMarketId
}
