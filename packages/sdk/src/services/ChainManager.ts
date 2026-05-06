import { chainById } from '@eth-optimism/viem/chains'
import type { SmartAccountClient } from 'permissionless/clients'
import { createSmartAccountClient } from 'permissionless/clients'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import {
  type Chain,
  createPublicClient,
  fallback,
  http,
  type PublicClient,
} from 'viem'
import type { BundlerClient, SmartAccount } from 'viem/account-abstraction'
import { createBundlerClient } from 'viem/account-abstraction'
import { mainnet, sepolia } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { ChainNotSupportedError } from '@/core/error/errors.js'
import type { ChainConfig } from '@/types/chain.js'

/** viem `pollingInterval` (ms) for L2-class chains with ~1-2s blocks. */
const FAST_CHAIN_POLLING_INTERVAL_MS = 1000
/** viem `pollingInterval` (ms) for L1-class chains with ~12s blocks. */
const SLOW_CHAIN_POLLING_INTERVAL_MS = 4000

const SLOW_CHAIN_IDS: ReadonlySet<SupportedChainId> = new Set([
  mainnet.id,
  sepolia.id,
])

function pollingIntervalForChain(chainId: SupportedChainId): number {
  return SLOW_CHAIN_IDS.has(chainId)
    ? SLOW_CHAIN_POLLING_INTERVAL_MS
    : FAST_CHAIN_POLLING_INTERVAL_MS
}

/**
 * Chain Manager Service
 * @description Manages public clients and chain infrastructure for the Verbs SDK.
 * Provides utilities for accessing RPC and bundler URLs, and creating clients for supported chains.
 */
export class ChainManager {
  /** Map of chain IDs to their corresponding public clients */
  private publicClients: Map<SupportedChainId, PublicClient>
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
  getPublicClient(chainId: SupportedChainId): PublicClient {
    const client = this.publicClients.get(chainId)
    if (!client) {
      throw new ChainNotSupportedError({
        chainId,
        supportedChainIds: this.getSupportedChains(),
      })
    }
    return client
  }

  /**
   * Get public client for a specific chain, or undefined if not configured.
   * Use this when the chain is optional (e.g. mainnet for ENS resolution).
   * @param chainId - The chain ID to retrieve the public client for
   * @returns PublicClient instance, or undefined if not configured
   */
  tryGetPublicClient(chainId: SupportedChainId): PublicClient | undefined {
    return this.publicClients.get(chainId)
  }

  /**
   * Get bundler client for a specific chain
   * @param chainId - The chain ID to retrieve the bundler client for
   * @param account - SmartAccount to use with the bundler client
   * @returns BundlerClient instance for the specified chain
   * @throws Error if no bundler URL is configured for the chain ID
   */
  getBundlerClient(
    chainId: SupportedChainId,
    account: SmartAccount,
  ): BundlerClient | SmartAccountClient {
    const chainConfig = this.getChainConfig(chainId)
    const bundlerConfig = chainConfig.bundler
    if (!bundlerConfig) {
      throw new ChainNotSupportedError({
        chainId,
        supportedChainIds: this.getSupportedChains(),
      })
    }
    if (bundlerConfig.type === 'pimlico') {
      return this.getPimlicoBundlerClient(
        chainId,
        account,
        bundlerConfig.sponsorshipPolicyId,
      )
    }
    const bundlerUrl = this.getBundlerUrl(chainId)
    if (!bundlerUrl) {
      throw new ChainNotSupportedError({
        chainId,
        supportedChainIds: this.getSupportedChains(),
      })
    }
    const client = createPublicClient({
      chain: this.getChain(chainId),
      transport: http(bundlerUrl),
      pollingInterval: pollingIntervalForChain(chainId),
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
  getRpcUrls(chainId: SupportedChainId): string[] | undefined {
    const chainConfig = this.getChainConfig(chainId)
    return chainConfig.rpcUrls
  }

  /**
   * Get bundler URL for a specific chain
   * @param chainId - The chain ID to retrieve the bundler URL for
   * @returns Bundler URL as a string or undefined if not configured
   * @throws Error if no chain config is found for the chain ID
   */
  getBundlerUrl(chainId: SupportedChainId): string | undefined {
    const chainConfig = this.getChainConfig(chainId)
    if (!chainConfig.bundler) {
      throw new ChainNotSupportedError({
        chainId,
        supportedChainIds: this.getSupportedChains(),
      })
    }
    return chainConfig.bundler.url
  }

  /**
   * Get chain information for a specific chain ID
   * @param chainId - The chain ID to retrieve information for
   * @returns Chain object containing chain details
   */
  getChain(chainId: SupportedChainId): Chain {
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
   * Get transport for a specific chain with fallback support
   * @param chainId - The chain ID to retrieve the transport for
   * @returns Transport configured with fallback RPC URLs or default http transport
   * @throws Error if no chain config is found for the chain ID
   */
  getTransportForChain(chainId: SupportedChainId) {
    const rpcUrls = this.getRpcUrls(chainId)
    return rpcUrls?.length
      ? fallback(rpcUrls.map((rpcUrl) => http(rpcUrl)))
      : http()
  }

  /**
   * Create public clients for all configured chains
   * @param chains - Array of chain configurations
   * @returns Map of chain IDs to their corresponding public clients
   * @throws Error if a chain is not found or already configured
   */
  private createPublicClients(
    chains: ChainConfig[],
  ): Map<SupportedChainId, PublicClient> {
    const clients = new Map<SupportedChainId, PublicClient>()

    for (const chainConfig of chains) {
      const chain = chainById[chainConfig.chainId]
      if (!chain) {
        throw new ChainNotSupportedError({ chainId: chainConfig.chainId })
      }
      if (clients.has(chainConfig.chainId)) {
        throw new ChainNotSupportedError({
          chainId: chainConfig.chainId,
          supportedChainIds: Array.from(clients.keys()),
        })
      }
      const client = createPublicClient({
        chain,
        transport: this.getTransportForChain(chainConfig.chainId),
        pollingInterval: pollingIntervalForChain(chainConfig.chainId),
      })

      clients.set(chainConfig.chainId, client)
    }

    return clients
  }

  /**
   * Get chain config for a specific chain ID
   * @param chainId The chain ID to retrieve the chain config for
   * @returns ChainConfig object containing chain details
   */
  private getChainConfig(chainId: SupportedChainId): ChainConfig {
    const chainConfig = this.chainConfigs.find((c) => c.chainId === chainId)
    if (!chainConfig) {
      throw new ChainNotSupportedError({
        chainId,
        supportedChainIds: this.getSupportedChains(),
      })
    }
    return chainConfig
  }

  /**
   * Get Pimlico bundler client for a specific chain
   * @param chainId - The chain ID to retrieve the Pimlico bundler client for
   * @param account - SmartAccount to use with the Pimlico bundler client
   * @param sponsorshipPolicyId - The sponsorship policy ID to use with the Pimlico bundler client
   * @returns Pimlico bundler client for the specified chain
   */
  private getPimlicoBundlerClient(
    chainId: SupportedChainId,
    account: SmartAccount,
    sponsorshipPolicyId?: string,
  ) {
    const bundlerUrl = this.getBundlerUrl(chainId)
    const pimlicoClient = createPimlicoClient({
      chain: this.getChain(chainId),
      transport: http(bundlerUrl),
      entryPoint: {
        address: account.entryPoint.address,
        version: account.entryPoint.version,
      },
    })
    const smartClient = createSmartAccountClient({
      account,
      chain: this.getChain(chainId),
      bundlerTransport: http(bundlerUrl),
      paymasterContext: sponsorshipPolicyId
        ? {
            sponsorshipPolicyId,
          }
        : undefined,
      userOperation: {
        estimateFeesPerGas: async () =>
          (await pimlicoClient.getUserOperationGasPrice()).fast,
      },
    })
    return smartClient
  }
}
