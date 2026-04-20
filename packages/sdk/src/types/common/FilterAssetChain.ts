import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

/**
 * Common filter parameters shared across SDK list queries (Lend, Swap, Borrow, …).
 * @description Base interface for filtering by asset and/or chain.
 */
export interface FilterAssetChain {
  /** Optional asset to filter by */
  asset?: Asset
  /** Optional chain ID to filter by */
  chainId?: SupportedChainId
}
