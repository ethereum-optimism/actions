import { chainById } from '@eth-optimism/viem/chains'
import { createPublicClient, http, type PublicClient } from 'viem'

import type { SUPPORTED_CHAIN_IDS } from '@/constants/supportedChains.js'
import type { ChainConfig } from '@/types/chain.js'

/**
 * Chain Manager Service
 * @description Manages public clients and chain infrastructure for the Verbs SDK
 */
export class ChainManager {
  private publicClients: Map<(typeof SUPPORTED_CHAIN_IDS)[number], PublicClient>
  private chainConfigs: ChainConfig[]

  constructor(chains: ChainConfig[]) {
    this.chainConfigs = chains
    this.publicClients = this.createPublicClients(chains)
  }

  /**
   * Create public clients for all configured chains
   */
  private createPublicClients(
    chains: ChainConfig[],
  ): Map<(typeof SUPPORTED_CHAIN_IDS)[number], PublicClient> {
    const clients = new Map<
      (typeof SUPPORTED_CHAIN_IDS)[number],
      PublicClient
    >()

    for (const chainConfig of chains) {
      const chain = chainById[chainConfig.chainId]
      if (!chain) {
        throw new Error(`Chain not found for ID: ${chainConfig.chainId}`)
      }
      if (clients.has(chainConfig.chainId)) {
        throw new Error(
          `Public client already configured for chain ID: ${chainConfig.chainId}`,
        )
      }
      const client = createPublicClient({
        chain,
        transport: http(chainConfig.rpcUrl),
      })

      clients.set(chainConfig.chainId, client)
    }

    return clients
  }

  /**
   * Get public client for a specific chain
   */
  getPublicClient(chainId: (typeof SUPPORTED_CHAIN_IDS)[number]): PublicClient {
    const client = this.publicClients.get(chainId)
    if (!client) {
      throw new Error(`No public client configured for chain ID: ${chainId}`)
    }
    return client
  }

  /**
   * Get supported chain IDs
   */
  getSupportedChains() {
    return this.chainConfigs.map((c) => c.chainId)
  }
}
