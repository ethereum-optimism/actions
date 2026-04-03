/**
 * A string that looks like an ENS name (contains at least one dot).
 * Mirrors the pattern of viem's Address type — structural constraint at the type level,
 * with runtime validation handled by normalize() inside resolveAddress().
 */
export type EnsName = `${string}.${string}`

/**
 * Type guard for EnsName. Mirrors the pattern of viem's isAddress.
 * @param value - String to check
 * @returns True if the value satisfies the EnsName structural constraint
 */
export function isEnsName(value: string): value is EnsName {
  return value.includes('.')
}
