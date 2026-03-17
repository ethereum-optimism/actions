import { ChainId } from '@morpho-org/blue-sdk'
import {
  base,
  baseSepolia,
  ink,
  mode,
  optimism,
  soneium,
  unichain,
  worldchain,
} from 'viem/chains'

import { SUPPORTED_CHAIN_IDS as ACTIONS_SUPPORTED_CHAIN_IDS } from '@/constants/supportedChains.js'
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
 * Morpho Blue contract addresses per chain.
 * Mainnet chains use the SDK for richer data (rewards, allocations) when available.
 * These contracts serve as the on-chain fallback and as the canonical deployment registry.
 * @see https://github.com/morpho-org/sdks
 */
export const MORPHO_CONTRACTS: MorphoContractsRegistry = {
  [optimism.id]: {
    morphoBlue: MORPHO_BLUE,
    irm: '0x8cD70A8F399428456b29546BC5dBe10ab6a06ef6',
  },
  [base.id]: {
    morphoBlue: MORPHO_BLUE,
    irm: '0x46415998764C29aB2a25CbeA6254146D50D22687',
  },
  [unichain.id]: {
    morphoBlue: MORPHO_BLUE,
    irm: '0x9a6061d51743B31D2c3Be75D83781Fa423f53F0E',
  },
  [worldchain.id]: {
    morphoBlue: MORPHO_BLUE,
    irm: '0x34E99D604751a72cF8d0CFDf87069292d82De472',
  },
  [ink.id]: {
    morphoBlue: MORPHO_BLUE,
    irm: '0x9515407b1512F53388ffE699524100e7270Ee57B',
  },
  [soneium.id]: {
    morphoBlue: MORPHO_BLUE,
    irm: '0x68F9b666b984527A7c145Db4103Cc6d3171C797F',
  },
  [mode.id]: {
    morphoBlue: MORPHO_BLUE,
    irm: '0xE3d46Ae190Cb39ccA3655E966DcEF96b4eAe1d1c',
  },
  [baseSepolia.id]: {
    morphoBlue: MORPHO_BLUE,
    irm: '0x46415998764C29aB2a25CbeA6254146D50D22687',
  },
}

/**
 * Get Morpho contracts for a chain
 */
export function getMorphoContracts(
  chainId: number,
): MorphoContracts | undefined {
  return MORPHO_CONTRACTS[chainId as SupportedChainId]
}

/**
 * Get all chain IDs where Morpho is deployed AND supported by the Actions SDK.
 * Combines local contracts registry with Morpho SDK's ChainId enum,
 * filtered to the Actions SDK's supported chains.
 */
export function getSupportedChainIds(): number[] {
  const localChains = Object.keys(MORPHO_CONTRACTS).map(Number)
  const sdkChains = Object.values(ChainId).filter(
    (value): value is number => typeof value === 'number',
  )
  const allMorphoChains = [...new Set([...localChains, ...sdkChains])]
  return allMorphoChains.filter((chainId) =>
    (ACTIONS_SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId),
  )
}
