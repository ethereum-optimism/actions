import {
  createActions,
  type NodeActionsConfig,
} from '@eth-optimism/actions-sdk'

import { loadConfig } from '@/config/loadConfig.js'

export type CliActions = ReturnType<typeof createActions<never>>

export interface BaseContext {
  config: NodeActionsConfig<never>
  actions: CliActions
}

/**
 * @description Builds the tier-0 context for read-only CLI commands
 * (`assets`, `chains`). Loads the resolved config and constructs a fresh
 * `Actions` instance per invocation — the CLI runs as a short-lived
 * subprocess, so module-level singletons would only add startup surprise
 * without saving allocation cost. Does not read `PRIVATE_KEY`, so
 * `actions --help` and the no-wallet commands work with no env vars set.
 * @returns Base context bundle.
 */
export function baseContext(): BaseContext {
  const config = loadConfig()
  const actions = createActions<never>(config)
  return { config, actions }
}
