import type {
  SwapMarketConfig,
  SwapProviderConfig,
} from '@/types/swap/index.js'

/**
 * Velodrome/Aerodrome market config with pool stability flag
 */
export interface VelodromeMarketConfig extends SwapMarketConfig {
  /** true = stable pool (correlated assets), false = volatile pool */
  stable?: boolean
}

/**
 * Velodrome/Aerodrome swap provider configuration
 */
export interface VelodromeSwapProviderConfig extends SwapProviderConfig {
  marketAllowlist?: VelodromeMarketConfig[]
  marketBlocklist?: VelodromeMarketConfig[]
}
