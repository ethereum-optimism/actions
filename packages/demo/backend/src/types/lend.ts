import type {
  ApyBreakdown,
  Asset,
  LendMarketId,
  LendMarketMetadata,
  SupportedChainId,
} from '@eth-optimism/verbs-sdk'
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
  userId: string
  amount: number
  tokenAddress: Address
  chainId: SupportedChainId
  vaultAddress: Address
  isUserWallet?: boolean
}

/**
 * Position operation response
 */
export interface PositionResponse {
  hash: string
  userOpHash?: string
  blockExplorerUrl: string
  amount: number
  tokenAddress: Address
  chainId: number
  vaultAddress: Address
}
