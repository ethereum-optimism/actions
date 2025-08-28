import type { SUPPORTED_CHAIN_IDS } from '@/constants/supportedChains.js'

/**
 * Chain configuration
 * @description Configuration for each supported chain
 */
export interface ChainConfig {
  /** Chain ID */
  chainId: (typeof SUPPORTED_CHAIN_IDS)[number]
  /** RPC URL for the chain */
  rpcUrl: string
  /** Bundler URL for the chain */
  bundlerUrl?: string
}
