import type { SupportedChainId } from '@/constants/supportedChains.js'

import { VELODROME_CHAINS, type VelodromeChainConfig } from './addresses.js'
import type { VelodromeMarketConfig } from './types.js'

export type {
  VelodromeChainConfig,
  VelodromeContracts,
  VelodromeRouterType,
} from './addresses.js'

/**
 * Get Velodrome/Aerodrome chain config including contracts and metadata.
 * @param chainId - Target chain
 * @returns Chain config with contracts and router type
 * @throws If chain is not supported
 */
export function getChainConfig(
  chainId: SupportedChainId,
): VelodromeChainConfig {
  const config = VELODROME_CHAINS[chainId]
  if (!config) {
    throw new Error(`Velodrome/Aerodrome not supported on chain ${chainId}`)
  }
  return config
}

/**
 * Get all chain IDs where Velodrome/Aerodrome is deployed.
 */
export function getSupportedChainIds(): SupportedChainId[] {
  return Object.keys(VELODROME_CHAINS).map(Number) as SupportedChainId[]
}

/**
 * Filter market allowlist to configs with valid pool parameters.
 * @param allowlist - Raw market allowlist from provider config
 * @returns Configs that have either stable (v2) or tickSpacing (CL) set
 */
export function getValidMarketConfigs(
  allowlist?: VelodromeMarketConfig[],
): VelodromeMarketConfig[] {
  return (allowlist ?? []).filter(
    (f) => f.stable !== undefined || f.tickSpacing !== undefined,
  )
}
