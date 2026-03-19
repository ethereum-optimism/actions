import type { LendProvider } from '@/lend/core/LendProvider.js'
import type { SwapProvider } from '@/swap/core/SwapProvider.js'
import type { LendProviderConfig } from '@/types/lend/index.js'
import type { SwapProviderConfig } from '@/types/swap/index.js'

/**
 * Map of available lend providers keyed by provider name.
 * Add new lend providers here — this is the single source of truth.
 */
export type LendProviders = {
  morpho?: LendProvider<LendProviderConfig>
  aave?: LendProvider<LendProviderConfig>
}

/**
 * Map of available swap providers keyed by provider name.
 * Add new swap providers here — this is the single source of truth.
 */
export type SwapProviders = {
  uniswap?: SwapProvider<SwapProviderConfig>
  velodrome?: SwapProvider<SwapProviderConfig>
}
