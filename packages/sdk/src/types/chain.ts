import type { SupportedChainId } from '@/constants/supportedChains.js'

/**
 * Chain configuration
 * @description Configuration for each supported chain
 */
export interface ChainConfig {
  /** Chain ID */
  chainId: SupportedChainId
  /** RPC URL for the chain */
  rpcUrls?: string[]
  /** Bundler configuration */
  bundler?: BundlerConfig
  /**
   * Polling interval (ms) for the chain's PublicClient. Used by viem's
   * `waitForTransactionReceipt` and friends when the transport is HTTP.
   * Defaults to 4000ms (viem default). Lower this for fast L2s.
   */
  pollingInterval?: number
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
