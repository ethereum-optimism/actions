import {
  base,
  baseSepolia,
  mainnet,
  optimismSepolia,
  unichain,
} from 'viem/chains'

export const SUPPORTED_CHAIN_IDS = [
  mainnet.id,
  unichain.id,
  base.id,
  baseSepolia.id,
  optimismSepolia.id,
] as const

export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number]
