import { base, mainnet, optimism } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'

export interface ForkChainConfig {
  chainId: SupportedChainId
  chain: typeof mainnet | typeof optimism | typeof base
  envVar: string
  fallbackRpc: string
  port: number
}

export const FORK_CHAINS: Record<string, ForkChainConfig> = {
  mainnet: {
    chainId: mainnet.id as SupportedChainId,
    chain: mainnet,
    envVar: 'MAINNET_RPC',
    fallbackRpc: 'https://eth.llamarpc.com',
    port: 18544,
  },
  optimism: {
    chainId: optimism.id as SupportedChainId,
    chain: optimism,
    envVar: 'OP_MAINNET_RPC',
    fallbackRpc: 'https://mainnet.optimism.io',
    port: 18545,
  },
  base: {
    chainId: base.id as SupportedChainId,
    chain: base,
    envVar: 'BASE_MAINNET_RPC',
    fallbackRpc: 'https://mainnet.base.org',
    port: 18546,
  },
} as const

const isCI = Boolean(process.env.CI)

/**
 * Get the upstream RPC URL for forking.
 * In CI, fails fast when the env var is missing -- public RPCs are too unreliable
 * for automated pipelines (rate limits, timeouts). Locally, falls back to a
 * public endpoint for convenience.
 */
export function getRpcUrl(config: ForkChainConfig): string {
  const envValue = process.env[config.envVar]
  if (envValue) return envValue

  if (isCI) {
    throw new Error(
      `Missing required env var ${config.envVar}. ` +
        'Network tests in CI require dedicated RPC endpoints — public fallbacks are not reliable enough.',
    )
  }

  return config.fallbackRpc
}

export function getForkUrl(config: ForkChainConfig): string {
  return `http://127.0.0.1:${config.port}`
}
