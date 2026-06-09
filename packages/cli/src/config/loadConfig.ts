import type { NodeActionsConfig } from '@eth-optimism/actions-sdk'

import { getDemoConfig } from '@/demo/config.js'

/**
 * @description Resolves the CLI's `NodeActionsConfig`. Returns the baked
 * demo config. Keep every `Actions` construction site behind `loadConfig`
 * so the source can be swapped without touching callers.
 * @returns The resolved Actions config for this process.
 */
export function loadConfig(): NodeActionsConfig<never> {
  return getDemoConfig()
}
