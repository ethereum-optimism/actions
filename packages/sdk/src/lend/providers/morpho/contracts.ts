import { base, baseSepolia, mainnet, unichain } from 'viem/chains'

import type { MorphoContractsRegistry } from '@/types/lend/contracts.js'

/**
 * Morpho Blue uses the same core contract address across all chains
 * via CREATE2 deterministic deployment
 */
const MORPHO_BLUE_ADDRESS = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as const

/**
 * Morpho contract addresses per chain
 */
export const MORPHO_CONTRACTS: MorphoContractsRegistry = {
  [mainnet.id]: {
    morphoBlue: MORPHO_BLUE_ADDRESS,
    irm: '0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC',
  },
  [base.id]: {
    morphoBlue: MORPHO_BLUE_ADDRESS,
    irm: '0x46415998764C29aB2a25CbeA6254146D50D22687',
  },
  [baseSepolia.id]: {
    morphoBlue: MORPHO_BLUE_ADDRESS,
    irm: '0x46415998764C29aB2a25CbeA6254146D50D22687',
  },
  [unichain.id]: {
    morphoBlue: MORPHO_BLUE_ADDRESS,
    irm: '0x46415998764C29aB2a25CbeA6254146D50D22687',
  },
}

/**
 * Seconds per year for APY calculations
 */
export const SECONDS_PER_YEAR = 31536000n

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
