import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import { baseSepolia, mainnet, optimismSepolia } from 'viem/chains'

import { type CliEnvKey, optionalEnv } from '@/config/env.js'

interface DemoChainConfig {
  chainId: SupportedChainId
  rpcUrls?: string[]
}

function rpcUrls(key: CliEnvKey): string[] | undefined {
  const url = optionalEnv(key)
  return url ? [url] : undefined
}

/**
 * @description Returns the CLI's baked demo chain set: Base Sepolia and Optimism Sepolia, mirroring the demo backend's market footprint. RPC URLs come from the matching `*_RPC_URL` env vars when set, otherwise viem's chain defaults apply. Bundler configuration is omitted intentionally: the CLI signs transactions from an EOA and the signer pays gas directly (no ERC-4337 gas abstraction for now).
 *
 * `MAINNET_RPC_URL` opts mainnet reads into an operator RPC; without it, ENS
 * uses the SDK fallback. Demo write markets stay testnet-only.
 * @returns Array of chain configs suitable for `NodeActionsConfig.chains`.
 */
export function getDemoChains(): DemoChainConfig[] {
  const chains: DemoChainConfig[] = [
    {
      chainId: baseSepolia.id,
      rpcUrls: rpcUrls('BASE_SEPOLIA_RPC_URL'),
    },
    {
      chainId: optimismSepolia.id,
      rpcUrls: rpcUrls('OP_SEPOLIA_RPC_URL'),
    },
  ]
  const mainnetRpc = rpcUrls('MAINNET_RPC_URL')
  if (mainnetRpc) {
    chains.push({ chainId: mainnet.id, rpcUrls: mainnetRpc })
  }
  return chains
}
