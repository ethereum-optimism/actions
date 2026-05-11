import type { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import type { LendProvider } from '@/actions/lend/core/LendProvider.js'
import type { SwapProvider } from '@/actions/swap/core/SwapProvider.js'
import type { BorrowProviderConfig } from '@/types/borrow/index.js'
import type { LendProviderConfig } from '@/types/lend/index.js'
import type { SwapProviderConfig } from '@/types/swap/index.js'

/**
 * Runtime list of lend provider names. Source of truth for both the
 * `LendProviderName` type union and any consumer (CLI, validators) that
 * needs to enumerate provider names at runtime.
 */
export const LEND_PROVIDER_NAMES = ['morpho', 'aave'] as const

/** Names of available lend providers. */
export type LendProviderName = (typeof LEND_PROVIDER_NAMES)[number]

/**
 * Map of available lend providers keyed by provider name.
 * Add new providers by extending `LEND_PROVIDER_NAMES`.
 */
export type LendProviders = {
  [K in LendProviderName]?: LendProvider<LendProviderConfig>
}

/**
 * Runtime list of borrow provider names. Source of truth for both the
 * `BorrowProviderName` type union and any consumer (CLI, validators) that
 * needs to enumerate provider names at runtime.
 */
export const BORROW_PROVIDER_NAMES = ['morpho'] as const

/** Names of available borrow providers. */
export type BorrowProviderName = (typeof BORROW_PROVIDER_NAMES)[number]

/**
 * Map of available borrow providers keyed by provider name.
 * Add new providers by extending `BORROW_PROVIDER_NAMES`.
 */
export type BorrowProviders = {
  [K in BorrowProviderName]?: BorrowProvider<BorrowProviderConfig>
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
