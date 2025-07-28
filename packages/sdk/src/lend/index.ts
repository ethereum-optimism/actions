import type { PublicClient } from 'viem'

import type { LendConfig, LendProvider } from '../types/lend.js'
import { LendProviderMorpho } from './providers/morpho/index.js'

/**
 * Create a lending provider based on configuration
 * @description Factory function for creating lending provider instances
 * @param config - Lending provider configuration
 * @param publicClient - Viem public client for blockchain interactions
 * @returns Lending provider instance
 */
export function createLendProvider(
  config: LendConfig,
  publicClient: PublicClient,
): LendProvider {
  switch (config.type) {
    case 'morpho':
      return new LendProviderMorpho(config, publicClient)
    default:
      throw new Error(`Unsupported lending provider type`)
  }
}

export { LendProviderMorpho } from './providers/morpho/index.js'
