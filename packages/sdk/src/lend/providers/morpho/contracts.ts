import { baseSepolia } from 'viem/chains'

import type { MorphoContractsRegistry } from '@/types/lend/contracts.js'

/**
 * Morpho Blue core contract - same address on all chains via CREATE2
 */
const MORPHO_BLUE = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as const

/**
 * Contract addresses for chains NOT supported by Morpho SDK (testnets).
 * Mainnet/Base use the SDK which provides richer data including rewards.
 */
export const MORPHO_CONTRACTS: MorphoContractsRegistry = {
  [baseSepolia.id]: {
    morphoBlue: MORPHO_BLUE,
    irm: '0x46415998764C29aB2a25CbeA6254146D50D22687',
  },
}

/**
 * Get Morpho contracts for a chain
 * @param chainId - Chain ID
 * @returns Morpho contracts if supported, undefined otherwise
 */
export function getMorphoContracts(chainId: number) {
  return MORPHO_CONTRACTS[chainId]
}

/**
 * Check if Morpho is supported on a chain
 * @param chainId - Chain ID
 * @returns true if Morpho is deployed on this chain
 */
export function isMorphoChainSupported(chainId: number): boolean {
  return chainId in MORPHO_CONTRACTS
}
