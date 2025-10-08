import { baseSepolia, unichain } from 'viem/chains'

import { env } from './env.js'

export const UNICHAIN = {
  chainId: unichain.id,
  rpcUrls: env.UNICHAIN_RPC_URL ? [env.UNICHAIN_RPC_URL] : undefined,
  bundler: {
    type: 'pimlico' as const,
    url: env.UNICHAIN_BUNDLER_URL,
    sponsorshipPolicyId: env.UNICHAIN_BUNDLER_SPONSORSHIP_POLICY,
  },
}
export const BASE_SEPOLIA = {
  chainId: baseSepolia.id,
  rpcUrls: env.BASE_SEPOLIA_RPC_URL ? [env.BASE_SEPOLIA_RPC_URL] : undefined,
  bundler: {
    type: 'simple' as const,
    url: env.BASE_SEPOLIA_BUNDER_URL,
  },
}
