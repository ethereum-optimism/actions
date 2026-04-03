import type { Address } from 'viem'

/**
 * A dot-separated ENS name (e.g. `vitalik.eth`, `sub.vitalik.eth`, `example.com`).
 *
 * ENS is not limited to `.eth` — it supports any DNSSEC-enabled DNS TLD as well
 * as ENS-native TLDs (`.eth`, `.test`). Subdomains of arbitrary depth are valid.
 *
 * This type is a structural constraint (at least one dot) mirroring viem's Address type.
 * True validity is determined at runtime by `normalize()` (ENSIP-15): a name is valid
 * if and only if it does not throw during normalization.
 */
export type EnsName = `${string}.${string}`

/**
 * Type guard for EnsName. Mirrors the pattern of viem's isAddress.
 * Rejects obviously invalid forms (leading/trailing dots, consecutive dots)
 * but does not run full ENSIP-15 normalization — use normalize() for that.
 * @param value - String to check
 * @returns True if the value satisfies the EnsName structural constraint
 */
export function isEnsName(value: string): value is EnsName {
  return (
    value.includes('.') &&
    !value.startsWith('.') &&
    !value.endsWith('.') &&
    !value.includes('..')
  )
}

/**
 * Standard ENS profile text record fields as defined by ENSIP-5 and ENSIP-18.
 * All fields are null when not set on the resolver.
 */
export interface EnsInfo {
  avatar: string | null
  display: string | null
  description: string | null
  url: string | null
  email: string | null
  keywords: string | null
  /** com.twitter */
  twitter: string | null
  /** com.github */
  github: string | null
  /** com.discord */
  discord: string | null
  /** org.reddit */
  reddit: string | null
}

/**
 * Common interface for human-readable name service providers.
 * Implemented by {@link EnsNamespace}; designed to support future providers
 * such as Basename, Lens, Unstoppable Domains, etc.
 */
export interface NameServiceProvider {
  /** Resolve a name or address to a checksummed hex address. */
  getAddress(input: Address | EnsName): Promise<Address>
  /** Reverse-resolve an address to its primary name, or null if not set. */
  getName(address: Address): Promise<EnsName | null>
  /** Fetch all standard profile text record fields in a single batched call. */
  getInfo(input: Address | EnsName): Promise<EnsInfo>
}
