import {
  base,
  baseSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  sepolia,
  unichain,
  unichainSepolia,
  worldchain,
} from 'viem/chains'

export const SUPPORTED_CHAIN_IDS = [
  mainnet.id,
  sepolia.id,
  optimism.id,
  optimismSepolia.id,
  base.id,
  baseSepolia.id,
  unichain.id,
  unichainSepolia.id,
  worldchain.id,
] as const

export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number]
