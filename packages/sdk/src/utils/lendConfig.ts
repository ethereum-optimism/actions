import type { LendConfig } from '@/types/actions.js'
import type { LendMarketConfig, LendProviderConfig } from '@/types/lend/base.js'

/**
 * Flatten every provider's `marketAllowlist` from a `LendConfig` into a single
 * list. Skips the `settings` sibling key — `LendConfig` mixes per-provider
 * configs with a `LendSettings` entry, and only provider entries carry
 * `marketAllowlist`.
 *
 * Returns an empty list when `lend` is undefined or no provider declares an
 * allowlist.
 */
export function getLendMarketAllowlist(
  lend: LendConfig | undefined,
): readonly LendMarketConfig[] {
  if (!lend) return []
  const out: LendMarketConfig[] = []
  for (const [key, value] of Object.entries(lend)) {
    if (key === 'settings') continue
    const provider = value as LendProviderConfig | undefined
    if (provider?.marketAllowlist) out.push(...provider.marketAllowlist)
  }
  return out
}
