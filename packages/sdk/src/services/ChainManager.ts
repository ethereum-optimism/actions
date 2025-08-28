import { chainById } from '@eth-optimism/viem/chains'
import { type Chain, createPublicClient, http, type PublicClient } from 'viem'
import type { BundlerClient, SmartAccount } from 'viem/account-abstraction'
import { createBundlerClient } from 'viem/account-abstraction'

import type { SUPPORTED_CHAIN_IDS } from '@/constants/supportedChains.js'
import type { ChainConfig } from '@/types/chain.js'

/**
 * Chain Manager Service
 * @description Manages public clients and chain infrastructure for the Verbs SDK.
 * Provides utilities for accessing RPC and bundler URLs, and creating clients for supported chains.
 */
export class ChainManager {
  /** Map of chain IDs to their corresponding public clients */
  private publicClients: Map<(typeof SUPPORTED_CHAIN_IDS)[number], PublicClient>
  /** Configuration for each supported chain */
  private chainConfigs: ChainConfig[]

  /**
   * Initialize the ChainManager with chain configurations
   * @param chains - Array of chain configurations
   */
  constructor(chains: ChainConfig[]) {
    this.chainConfigs = chains
    this.publicClients = this.createPublicClients(chains)
  }

  /**
   * Get public client for a specific chain
   * @param chainId - The chain ID to retrieve the public client for
   * @returns PublicClient instance for the specified chain
   * @throws Error if no client is configured for the chain ID
   */
  getPublicClient(chainId: (typeof SUPPORTED_CHAIN_IDS)[number]): PublicClient {
    const client = this.publicClients.get(chainId)
    if (!client) {
      throw new Error(`No public client configured for chain ID: ${chainId}`)
    }
    return client
  }

  /**
   * Get bundler client for a specific chain
   * @param chainId - The chain ID to retrieve the bundler client for
   * @param account - SmartAccount to use with the bundler client
   * @returns BundlerClient instance for the specified chain
   * @throws Error if no bundler URL is configured for the chain ID
   */
  getBundlerClient(
    chainId: (typeof SUPPORTED_CHAIN_IDS)[number],
    account: SmartAccount,
  ): BundlerClient {
    const bundlerUrl = this.getBundlerUrl(chainId)
    if (!bundlerUrl) {
      throw new Error(`No bundler URL configured for chain ID: ${chainId}`)
    }
    const client = createPublicClient({
      chain: this.getChain(chainId),
      transport: http(bundlerUrl),
    })
    return createBundlerClient({
      account,
      client,
      transport: http(bundlerUrl),
      chain: this.getChain(chainId),
    })
  }

  /**
   * Get RPC URL for a specific chain
   * @param chainId - The chain ID to retrieve the RPC URL for
   * @returns RPC URL as a string
   * @throws Error if no chain config is found for the chain ID
   */
  getRpcUrl(chainId: (typeof SUPPORTED_CHAIN_IDS)[number]): string {
    const chainConfig = this.chainConfigs.find((c) => c.chainId === chainId)
    if (!chainConfig) {
      throw new Error(`No chain config found for chain ID: ${chainId}`)
    }
    return chainConfig.rpcUrl
  }

  /**
   * Get bundler URL for a specific chain
   * @param chainId - The chain ID to retrieve the bundler URL for
   * @returns Bundler URL as a string or undefined if not configured
   * @throws Error if no chain config is found for the chain ID
   */
  getBundlerUrl(
    chainId: (typeof SUPPORTED_CHAIN_IDS)[number],
  ): string | undefined {
    const chainConfig = this.chainConfigs.find((c) => c.chainId === chainId)
    if (!chainConfig) {
      throw new Error(`No chain config found for chain ID: ${chainId}`)
    }
    return chainConfig.bundlerUrl
  }

  /**
   * Get chain information for a specific chain ID
   * @param chainId - The chain ID to retrieve information for
   * @returns Chain object containing chain details
   */
  getChain(chainId: (typeof SUPPORTED_CHAIN_IDS)[number]): Chain {
    return chainById[chainId]
  }

  /**
   * Get all supported chain IDs
   * @returns Array of supported chain IDs
   */
  getSupportedChains() {
    return this.chainConfigs.map((c) => c.chainId)
  }

  /**
   * Create public clients for all configured chains
   * @param chains - Array of chain configurations
   * @returns Map of chain IDs to their corresponding public clients
   * @throws Error if a chain is not found or already configured
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
}
