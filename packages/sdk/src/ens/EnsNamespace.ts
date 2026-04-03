import type { Address } from 'viem'
import { mainnet } from 'viem/chains'
import { normalize } from 'viem/ens'

import type { ChainManager } from '@/services/ChainManager.js'
import { resolveAddress } from '@/utils/ens.js'

import {
  EnsNotConfiguredError,
  EnsResolutionError,
  EnsRpcError,
} from './errors.js'
import { type EnsName, isEnsName } from './types.js'

/** Default TTL for cached ENS lookups — 5 minutes */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000

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
  private readonly cacheTtlMs: number
  private resolveCache = new Map<
    string,
    { value: Address; expiresAt: number }
  >()
  private reverseCache = new Map<
    Address,
    { value: EnsName | null; expiresAt: number }
  >()
  private textCache = new Map<
    string,
    { value: string | null; expiresAt: number }
  >()

  constructor(chainManager: ChainManager, cacheTtlMs = DEFAULT_CACHE_TTL_MS) {
    this.chainManager = chainManager
    this.cacheTtlMs = cacheTtlMs
  }

  /**
   * Resolve an ENS name or hex address to a checksummed hex address.
   * Hex addresses are returned as-is after format validation.
   * Uses the mainnet client from your Actions chain configuration automatically.
   *
   * If you need to resolve outside of an {@link Actions} instance (e.g. in a
   * provider or script), use the lower-level `resolveAddress` utility instead.
   * @param input - Hex address (0x...) or ENS name (e.g. "vitalik.eth")
   * @returns Resolved hex address
   * @throws {EnsNotConfiguredError} If mainnet is not in your chain configuration
   * @throws {EnsResolutionError} If the name cannot be resolved
   * @throws {EnsRpcError} If the RPC call fails
   */
  async resolve(input: Address | EnsName): Promise<Address> {
    const cached = this.resolveCache.get(input)
    if (cached && Date.now() < cached.expiresAt) return cached.value
    const value = await resolveAddress(
      input,
      this.chainManager.tryGetPublicClient(mainnet.id),
    )
    this.resolveCache.set(input, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    })
    return value
  }

  /**
   * Reverse-resolve an address to its primary ENS name.
   * @param address - Hex address to look up
   * @returns ENS name, or null if none is set
   * @throws {EnsNotConfiguredError} If mainnet is not in your chain configuration
   * @throws {EnsRpcError} If the RPC call fails
   */
  async reverseResolve(address: Address): Promise<EnsName | null> {
    const cached = this.reverseCache.get(address)
    if (cached && Date.now() < cached.expiresAt) return cached.value
    const client = this.requireMainnetClient()
    const name = await client
      .getEnsName({ address })
      .catch((cause: unknown) => {
        throw new EnsRpcError(
          `ENS reverse resolution failed for "${address}": RPC error`,
          address,
          { cause },
        )
      })
    const value = name && isEnsName(name) ? name : null
    this.reverseCache.set(address, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    })
    return value
  }

  /**
   * Look up a text record for an ENS name or address.
   * Common keys: "avatar", "url", "email", "com.twitter", "com.github"
   * @param input - Hex address (0x...) or ENS name
   * @param key - Text record key
   * @returns Text record value, or null if not set
   * @throws {EnsNotConfiguredError} If mainnet is not in your chain configuration
   * @throws {EnsResolutionError} If the name cannot be resolved or normalized
   * @throws {EnsRpcError} If the RPC call fails
   */
  async lookupText(
    input: Address | EnsName,
    key: string,
  ): Promise<string | null> {
    const name = isEnsName(input) ? input : await this.reverseResolve(input)
    if (!name) return null
    const cacheKey = `${name}:${key}`
    const cached = this.textCache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) return cached.value
    const normalized = (() => {
      try {
        return normalize(name)
      } catch (cause) {
        throw new EnsResolutionError(
          `ENS name "${name}" is invalid and cannot be normalized`,
          name,
          { cause },
        )
      }
    })()
    const value =
      (await this.requireMainnetClient()
        .getEnsText({ name: normalized, key })
        .catch((cause: unknown) => {
          throw new EnsRpcError(
            `ENS text record lookup failed for "${name}" key "${key}": RPC error`,
            name,
            { cause },
          )
        })) ?? null
    this.textCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    })
    return value
  }

  private requireMainnetClient() {
    const client = this.chainManager.tryGetPublicClient(mainnet.id)
    if (!client) throw new EnsNotConfiguredError()
    return client
  }
}
