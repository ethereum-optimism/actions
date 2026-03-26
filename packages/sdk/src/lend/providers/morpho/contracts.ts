import {
  base,
  baseSepolia,
  ink,
  mainnet,
  mode,
  optimism,
  soneium,
  unichain,
  worldchain,
} from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  MorphoContracts,
  MorphoContractsRegistry,
} from '@/types/lend/contracts.js'

/**
 * Morpho Blue core contract - same address on all chains via CREATE2
 */
const MORPHO_BLUE = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as const

/**
 * Morpho chain configuration
 */
export interface MorphoChainConfig {
  contracts: MorphoContracts
  metadata: Record<string, never> // no metadata currently needed
}

/**
 * Morpho Blue contract addresses per chain.
 * Mainnet chains use the SDK for richer data (rewards, allocations) when available.
 * These contracts serve as the on-chain fallback and as the canonical deployment registry.
 * @see https://github.com/morpho-org/sdks
 */
export const MORPHO_CHAINS: Record<number, MorphoChainConfig> = {
  [mainnet.id]: {
    contracts: {
      morphoBlue: MORPHO_BLUE,
      irm: '0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC',
    },
    metadata: {},
  },
  [optimism.id]: {
    contracts: {
      morphoBlue: MORPHO_BLUE,
      irm: '0x8cD70A8F399428456b29546BC5dBe10ab6a06ef6',
    },
    metadata: {},
  },
  [base.id]: {
    contracts: {
      morphoBlue: MORPHO_BLUE,
      irm: '0x46415998764C29aB2a25CbeA6254146D50D22687',
    },
    metadata: {},
  },
  [unichain.id]: {
    contracts: {
      morphoBlue: MORPHO_BLUE,
      irm: '0x9a6061d51743B31D2c3Be75D83781Fa423f53F0E',
    },
    metadata: {},
  },
  [worldchain.id]: {
    contracts: {
      morphoBlue: MORPHO_BLUE,
      irm: '0x34E99D604751a72cF8d0CFDf87069292d82De472',
    },
    metadata: {},
  },
  [ink.id]: {
    contracts: {
      morphoBlue: MORPHO_BLUE,
      irm: '0x9515407b1512F53388ffE699524100e7270Ee57B',
    },
    metadata: {},
  },
  [soneium.id]: {
    contracts: {
      morphoBlue: MORPHO_BLUE,
      irm: '0x68F9b666b984527A7c145Db4103Cc6d3171C797F',
    },
    metadata: {},
  },
  [mode.id]: {
    contracts: {
      morphoBlue: MORPHO_BLUE,
      irm: '0xE3d46Ae190Cb39ccA3655E966DcEF96b4eAe1d1c',
    },
    metadata: {},
  },
  [baseSepolia.id]: {
    contracts: {
      morphoBlue: MORPHO_BLUE,
      irm: '0x46415998764C29aB2a25CbeA6254146D50D22687',
    },
    metadata: {},
  },
}

/**
 * Get Morpho contracts for a chain
 */
export function getMorphoContracts(
  chainId: number,
): MorphoContracts | undefined {
  return MORPHO_CHAINS[chainId as SupportedChainId]?.contracts
}

/**
 * Get all chain IDs where Morpho contracts are deployed.
 * Returns chains present in the local contracts registry.
 * Filtering against ACTIONS_SUPPORTED_CHAIN_IDS and developer-configured chains
 * is handled by the LendProvider base class.
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(MORPHO_CHAINS).map(Number)
}

// Keep legacy export for backwards compatibility (can be removed in a separate PR)
export const MORPHO_CONTRACTS: MorphoContractsRegistry = Object.fromEntries(
  Object.entries(MORPHO_CHAINS).map(([chainId, config]) => [
    Number(chainId),
    config.contracts,
  ]),
) as MorphoContractsRegistry
