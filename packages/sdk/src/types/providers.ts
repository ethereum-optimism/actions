import type { LendProvider } from '@/actions/lend/core/LendProvider.js'
import type { SwapProvider } from '@/actions/swap/core/SwapProvider.js'
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
 * Runtime list of swap provider names. Source of truth for both the
 * `SwapProviderName` type union and any consumer (CLI, validators) that
 * needs to enumerate provider names at runtime.
 */
export const SWAP_PROVIDER_NAMES = ['uniswap', 'velodrome'] as const

/** Names of available swap providers. */
export type SwapProviderName = (typeof SWAP_PROVIDER_NAMES)[number]

/**
 * Map of available swap providers keyed by provider name.
 * Add new providers by extending `SWAP_PROVIDER_NAMES`.
 */
export type SwapProviders = {
  [K in SwapProviderName]?: SwapProvider<SwapProviderConfig>
}
