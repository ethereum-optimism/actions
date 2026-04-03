import type { Address } from 'viem'
import { mainnet } from 'viem/chains'
import { normalize } from 'viem/ens'

import type { ChainManager } from '@/services/ChainManager.js'
import { resolveAddress } from '@/utils/ens.js'

import { type EnsName, isEnsName } from './types.js'

/**
 * Namespace for human-readable name resolution on Ethereum.
 * Currently backed by ENS (Ethereum Name Service) on mainnet.
 *
 * Designed to be extensible: future versions could support alternative name
 * services alongside ENS — e.g. Unstoppable Domains (.crypto, .nft, .wallet)
 * or Lens handles (@user.lens). The natural evolution is a NameServiceProvider
 * base class with pluggable implementations, with EnsNamespace routing
 * resolution to the correct provider based on name format.
 *
 * Requires Ethereum mainnet to be included in your chain configuration.
 */
export class EnsNamespace {
  private chainManager: ChainManager

  constructor(chainManager: ChainManager) {
    this.chainManager = chainManager
  }

  /**
   * Resolve an ENS name or hex address to a checksummed hex address.
   * Hex addresses are returned as-is after format validation.
   * @param input - Hex address (0x...) or ENS name (e.g. "vitalik.eth")
   * @returns Resolved hex address
   * @throws If ENS name cannot be resolved or mainnet is not configured
   */
  async resolve(input: Address | EnsName): Promise<Address> {
    return resolveAddress(input, this.getMainnetClient())
  }

  /**
   * Reverse-resolve an address to its primary ENS name.
   * @param address - Hex address to look up
   * @returns ENS name, or null if none is set
   * @throws If mainnet is not configured
   */
  async reverseResolve(address: Address): Promise<EnsName | null> {
    const client = this.requireMainnetClient()
    const name = await client
      .getEnsName({ address })
      .catch((cause: unknown) => {
        throw new Error(
          `ENS reverse resolution failed for "${address}": RPC error`,
          { cause },
        )
      })
    return name && isEnsName(name) ? name : null
  }

  /**
   * Look up a text record for an ENS name or address.
   * Common keys: "avatar", "url", "email", "com.twitter", "com.github"
   * @param input - Hex address (0x...) or ENS name
   * @param key - Text record key
   * @returns Text record value, or null if not set
   * @throws If ENS name cannot be resolved or mainnet is not configured
   */
  async lookupText(
    input: Address | EnsName,
    key: string,
  ): Promise<string | null> {
    const name = isEnsName(input) ? input : await this.reverseResolve(input)
    if (!name) return null
    const normalized = (() => {
      try {
        return normalize(name)
      } catch (cause) {
        throw new Error(
          `ENS name "${name}" is invalid and cannot be normalized`,
          { cause },
        )
      }
    })()
    const value = await this.requireMainnetClient()
      .getEnsText({ name: normalized, key })
      .catch((cause: unknown) => {
        throw new Error(
          `ENS text record lookup failed for "${name}" key "${key}": RPC error`,
          { cause },
        )
      })
    return value ?? null
  }

  private getMainnetClient() {
    try {
      return this.chainManager.getPublicClient(mainnet.id)
    } catch {
      return undefined
    }
  }

  private requireMainnetClient() {
    const client = this.getMainnetClient()
    if (!client) {
      throw new Error(
        `ENS operations require Ethereum mainnet. ` +
          `Add chain ID ${mainnet.id} to your chain configuration.`,
      )
    }
    return client
  }
}
