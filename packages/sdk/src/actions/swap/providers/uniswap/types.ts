import type {
  SwapMarketConfig,
  SwapProviderConfig,
} from '@/types/swap/index.js'

/**
 * Uniswap-specific market config with V4 pool parameters
 */
export interface UniswapMarketConfig extends SwapMarketConfig {
  /** Fee tier in pips (e.g. 100 = 0.01%) */
  fee?: number
  /** Tick spacing for the pool */
  tickSpacing?: number
}

/**
 * Uniswap swap provider configuration.
 * Provider-level values override the shared SwapGlobalConfig.
 */
export interface UniswapSwapProviderConfig extends SwapProviderConfig {
  marketAllowlist?: UniswapMarketConfig[]
  marketBlocklist?: UniswapMarketConfig[]
  /** Permit2 sub-approval expiration override in seconds from now. */
  permit2ExpirationSeconds?: number
}
