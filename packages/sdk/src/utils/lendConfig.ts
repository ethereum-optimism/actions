import type { LendConfig } from '@/types/actions.js'
import type { LendMarketConfig } from '@/types/lend/base.js'
import { LEND_PROVIDER_NAMES } from '@/types/providers.js'

/**
 * Flatten every provider's `marketAllowlist` from a `LendConfig` into a single
 * list. Returns an empty list when `lend` is undefined or no provider declares
 * an allowlist.
 */
export function getLendMarketAllowlist(
  lend: LendConfig | undefined,
): readonly LendMarketConfig[] {
  if (!lend) return []
  return LEND_PROVIDER_NAMES.flatMap(
    (name) => lend[name]?.marketAllowlist ?? [],
  )
}
