import type { PublicClient } from 'viem'

import type { LendConfig, LendProvider } from '../types/lend.js'
import { MorphoLendProvider } from './providers/morpho.js'

/**
 * Create a lending provider based on configuration
 * @description Factory function for creating lending provider instances
 * @param config - Lending provider configuration
 * @param chainId - Ethereum chain ID
 * @param publicClient - Viem public client for blockchain interactions
 * @returns Lending provider instance
 */
export function createLendProvider(
  config: LendConfig,
  chainId: number,
  publicClient: PublicClient,
): LendProvider {
  switch (config.type) {
    case 'morpho':
      return new MorphoLendProvider(config, chainId, publicClient)
    default:
      throw new Error(`Unsupported lending provider type`)
  }
}

export { MorphoLendProvider } from './providers/morpho.js'
