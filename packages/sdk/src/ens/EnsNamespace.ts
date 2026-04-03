import { type Address, createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { normalize } from 'viem/ens'

import type { ChainManager } from '@/services/ChainManager.js'
import { resolveAddress } from '@/utils/ens.js'

import { EnsResolutionError, EnsRpcError } from './errors.js'
import {
  type EnsInfo,
  type EnsName,
  isEnsName,
  type NameServiceProvider,
} from './types.js'

/** Default TTL for cached ENS lookups — 5 minutes */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000

/** Public mainnet RPC used as fallback when mainnet is not in chain config */
const FALLBACK_MAINNET_RPC = 'https://cloudflare-eth.com'

/** ENSIP-5 / ENSIP-18 standard text record keys mapped to EnsInfo field names */
const ENS_TEXT_KEYS = {
  avatar: 'avatar',
  display: 'display',
  description: 'description',
  url: 'url',
  email: 'email',
  keywords: 'keywords',
  twitter: 'com.twitter',
  github: 'com.github',
  discord: 'com.discord',
  reddit: 'org.reddit',
} as const satisfies Record<keyof EnsInfo, string>

/**
 * Namespace for human-readable name resolution on Ethereum.
 * Currently backed by ENS (Ethereum Name Service) on mainnet.
 *
 * Implements {@link NameServiceProvider} — designed to be extensible: future
 * versions could support alternative name services alongside ENS (e.g. Basename,
 * Unstoppable Domains, Lens handles). The natural evolution is additional
 * NameServiceProvider implementations registered under their own namespace
 * (e.g. `actions.basename`).
 *
 * Falls back to a public mainnet RPC automatically if mainnet is not included
 * in your chain configuration, so ENS works even in L2-only setups.
 */
export class EnsNamespace implements NameServiceProvider {
  private chainManager: ChainManager
  private readonly cacheTtlMs: number
  private addressCache = new Map<
    string,
    { value: Address; expiresAt: number }
  >()
  private nameCache = new Map<
    Address,
    { value: EnsName | null; expiresAt: number }
  >()
  private infoCache = new Map<string, { value: EnsInfo; expiresAt: number }>()

  constructor(chainManager: ChainManager, cacheTtlMs = DEFAULT_CACHE_TTL_MS) {
    this.chainManager = chainManager
    this.cacheTtlMs = cacheTtlMs
  }

  /**
   * Resolve an ENS name or hex address to a checksummed hex address.
   * Hex addresses are returned as-is after format validation.
   *
   * If you need to resolve outside of an {@link Actions} instance (e.g. in a
   * provider or script), use the lower-level `resolveAddress` utility instead.
   * @param input - Hex address (0x...) or ENS name (e.g. "vitalik.eth")
   * @returns Resolved hex address
   * @throws {EnsResolutionError} If the name cannot be resolved
   * @throws {EnsRpcError} If the RPC call fails
   */
  async getAddress(input: Address | EnsName): Promise<Address> {
    const cached = this.addressCache.get(input)
    if (cached && Date.now() < cached.expiresAt) return cached.value
    const value = await resolveAddress(input, this.getMainnetClient())
    this.addressCache.set(input, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    })
    return value
  }

  /**
   * Reverse-resolve an address to its primary ENS name.
   * @param address - Hex address to look up
   * @returns ENS name, or null if none is set
   * @throws {EnsRpcError} If the RPC call fails
   */
  async getName(address: Address): Promise<EnsName | null> {
    const cached = this.nameCache.get(address)
    if (cached && Date.now() < cached.expiresAt) return cached.value
    const name = await this.getMainnetClient()
      .getEnsName({ address })
      .catch((cause: unknown) => {
        throw new EnsRpcError(
          `ENS reverse resolution failed for "${address}": RPC error`,
          address,
          { cause },
        )
      })
    const value = name && isEnsName(name) ? name : null
    this.nameCache.set(address, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    })
    return value
  }

  /**
   * Fetch all standard ENS profile text record fields (ENSIP-5 / ENSIP-18)
   * for an ENS name or address in a single batched call.
   *
   * All fields are null when not set. Returns all-null if the address has
   * no primary ENS name.
   * @param input - Hex address (0x...) or ENS name
   * @returns EnsInfo object with all standard text record fields
   * @throws {EnsResolutionError} If the name cannot be normalized
   * @throws {EnsRpcError} If the RPC call fails
   */
  async getInfo(input: Address | EnsName): Promise<EnsInfo> {
    const name = isEnsName(input) ? input : await this.getName(input)
    if (!name) return nullInfo()

    const cached = this.infoCache.get(name)
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

    const client = this.getMainnetClient()
    const fetchKey = (key: string) =>
      client.getEnsText({ name: normalized, key }).catch((cause: unknown) => {
        throw new EnsRpcError(
          `ENS text record lookup failed for "${name}" key "${key}": RPC error`,
          name,
          { cause },
        )
      })

    const [
      avatar,
      display,
      description,
      url,
      email,
      keywords,
      twitter,
      github,
      discord,
      reddit,
    ] = await Promise.all(Object.values(ENS_TEXT_KEYS).map(fetchKey))

    const value: EnsInfo = {
      avatar: avatar ?? null,
      display: display ?? null,
      description: description ?? null,
      url: url ?? null,
      email: email ?? null,
      keywords: keywords ?? null,
      twitter: twitter ?? null,
      github: github ?? null,
      discord: discord ?? null,
      reddit: reddit ?? null,
    }

    this.infoCache.set(name, { value, expiresAt: Date.now() + this.cacheTtlMs })
    return value
  }

  private getMainnetClient() {
    return (
      this.chainManager.tryGetPublicClient(mainnet.id) ??
      createPublicClient({
        chain: mainnet,
        transport: http(FALLBACK_MAINNET_RPC),
      })
    )
  }
}

function nullInfo(): EnsInfo {
  return {
    avatar: null,
    display: null,
    description: null,
    url: null,
    email: null,
    keywords: null,
    twitter: null,
    github: null,
    discord: null,
    reddit: null,
  }
}
