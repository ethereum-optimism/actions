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
 * Returns true for any dot-containing string — use normalize() for full validation.
 * @param value - String to check
 * @returns True if the value satisfies the EnsName structural constraint
 */
export function isEnsName(value: string): value is EnsName {
  return value.includes('.')
}
