import type { Address } from 'viem'

import type { EmptyProviderMetadata } from '@/actions/shared/contractAddresses.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'

/**
 * Morpho contract addresses needed per chain.
 */
export interface MorphoContracts {
  /** Morpho Blue core contract - market state, positions, supply/withdraw */
  morphoBlue: Address
  /** Interest Rate Model contract - borrow rate calculation for APY */
  irm: Address
  /** MetaMorpho vault factory (optional, only for vault creation) */
  metaMorphoFactory?: Address
}

/**
 * Per-chain Morpho configuration.
 * @description Addresses live under `contracts`. No non-address settings exist yet.
 */
export interface MorphoChainConfig {
  contracts: MorphoContracts
  metadata: EmptyProviderMetadata
}

/**
 * Registry mapping chainId to Morpho chain config.
 */
export type MorphoContractsRegistry = Partial<
  Record<SupportedChainId, MorphoChainConfig>
>
