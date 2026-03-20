import type {
  SwapMarketConfig,
  SwapProviderConfig,
} from '@/types/swap/index.js'

/**
 * Velodrome/Aerodrome market config.
 * Exactly one of `stable` (v2 AMM) or `tickSpacing` (CL/Slipstream) must be set.
 */
export interface VelodromeMarketConfig extends SwapMarketConfig {
  /** true = stable pool (correlated assets), false = volatile pool. For v2 AMM pools. */
  stable?: boolean
  /** Tick spacing for CL/Slipstream pools. Mutually exclusive with stable. */
  tickSpacing?: number
}

/** Resolved v2 AMM pool config */
export type ResolvedV2Config = { type: 'v2'; stable: boolean }
/** Resolved CL/Slipstream pool config */
export type ResolvedCLConfig = { type: 'cl'; tickSpacing: number }
/** Discriminated union of resolved pool configs */
export type ResolvedPoolConfig = ResolvedV2Config | ResolvedCLConfig

/**
 * Velodrome/Aerodrome swap provider configuration
 */
export interface VelodromeSwapProviderConfig extends SwapProviderConfig {
  marketAllowlist?: VelodromeMarketConfig[]
  marketBlocklist?: VelodromeMarketConfig[]
}
