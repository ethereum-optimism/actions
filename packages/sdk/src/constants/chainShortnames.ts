import {
  base,
  baseSepolia,
  bob,
  celo,
  fraxtal,
  ink,
  lisk,
  mainnet,
  metalL2,
  mode,
  optimism,
  optimismSepolia,
  sepolia,
  soneium,
  superseed,
  swellchain,
  unichain,
  unichainSepolia,
  worldchain,
} from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'

/**
 * Canonical CLI / human-friendly shortname for each `SupportedChainId`.
 * Use this as the source of truth for `--chain` flag parsing and any other
 * surface that maps a user-typed chain string to a `SupportedChainId`. New
 * `SupportedChainId` additions must add a corresponding entry here so they
 * surface in CLI / tooling validation.
 */
export const CHAIN_SHORTNAMES: Record<SupportedChainId, string> = {
  [mainnet.id]: 'mainnet',
  [sepolia.id]: 'sepolia',
  [optimism.id]: 'optimism',
  [optimismSepolia.id]: 'op-sepolia',
  [base.id]: 'base',
  [baseSepolia.id]: 'base-sepolia',
  [unichain.id]: 'unichain',
  [unichainSepolia.id]: 'unichain-sepolia',
  [worldchain.id]: 'worldchain',
  [bob.id]: 'bob',
  [celo.id]: 'celo',
  [fraxtal.id]: 'fraxtal',
  [ink.id]: 'ink',
  [lisk.id]: 'lisk',
  [metalL2.id]: 'metal',
  [mode.id]: 'mode',
  [soneium.id]: 'soneium',
  [superseed.id]: 'superseed',
  [swellchain.id]: 'swell',
}
