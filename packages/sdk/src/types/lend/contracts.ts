import type { Address } from 'viem'

/**
 * Morpho contract addresses needed per chain
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
 * Registry mapping chainId to Morpho contracts
 */
export type MorphoContractsRegistry = Record<number, MorphoContracts>
