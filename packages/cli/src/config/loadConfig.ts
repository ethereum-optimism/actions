import type { NodeActionsConfig } from '@eth-optimism/actions-sdk'

import { getDemoConfig } from '@/demo/config.js'

/**
 * @description Resolves the CLI's `NodeActionsConfig`. PR 1 returns the
 * baked demo config unconditionally; the interactive agent-onboarding flow
 * (#411) will swap this for a per-user source without touching callers.
 * Keep every `Actions` construction site behind `loadConfig` so the
 * follow-up remains a drop-in replacement.
 * @returns The resolved Actions config for this process.
 */
export function loadConfig(): NodeActionsConfig<never> {
  return getDemoConfig()
}
