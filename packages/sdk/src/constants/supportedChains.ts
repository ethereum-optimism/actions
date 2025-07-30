import { base, mainnet, unichain } from 'viem/chains'

export const SUPPORTED_CHAIN_IDS = [mainnet.id, unichain.id, base.id] as const

export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number]
