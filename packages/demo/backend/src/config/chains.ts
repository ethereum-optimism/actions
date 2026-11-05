import { baseSepolia, optimismSepolia } from 'viem/chains'

import { env } from './env.js'

export const BASE_SEPOLIA = {
  chainId: baseSepolia.id,
  rpcUrls: env.BASE_SEPOLIA_RPC_URL ? [env.BASE_SEPOLIA_RPC_URL] : undefined,
  bundler: {
    type: 'simple' as const,
    url: env.BASE_SEPOLIA_BUNDLER_URL,
  },
}
export const OPTIMISM_SEPOLIA = {
  chainId: optimismSepolia.id,
  rpcUrls: env.OP_SEPOLIA_RPC_URL ? [env.OP_SEPOLIA_RPC_URL] : undefined,
  bundler: {
    type: 'pimlico' as const,
    url: env.OP_SEPOLIA_BUNDLER_URL,
  },
}
