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
  /** Bundler configuration */
  bundler?: BundlerConfig
}

export interface BaseBundlerConfig {
  /** The URL of the bundler service */
  url: string
}

export type BundlerConfig = SimpleBundlerConfig | PimlicoBundlerConfig

export interface SimpleBundlerConfig extends BaseBundlerConfig {
  type: 'simple'
}

export interface PimlicoBundlerConfig extends BaseBundlerConfig {
  type: 'pimlico'
  sponsorshipPolicyId?: string
}
