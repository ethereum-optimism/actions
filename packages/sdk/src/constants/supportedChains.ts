import {
  base,
  baseSepolia,
  ink,
  mainnet,
  mode,
  optimism,
  optimismSepolia,
  sepolia,
  soneium,
  unichain,
  unichainSepolia,
  worldchain,
} from 'viem/chains'

export const ACTIONS_SUPPORTED_CHAIN_IDS = [
  mainnet.id,
  sepolia.id,
  optimism.id,
  optimismSepolia.id,
  base.id,
  baseSepolia.id,
  unichain.id,
  unichainSepolia.id,
  worldchain.id,
  ink.id,
  soneium.id,
  mode.id,
] as const

export type SupportedChainId = (typeof ACTIONS_SUPPORTED_CHAIN_IDS)[number]
