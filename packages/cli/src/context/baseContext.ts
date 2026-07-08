import {
  createActions,
  type NodeActionsConfig,
} from '@eth-optimism/actions-sdk'
import { mainnet } from 'viem/chains'

import { loadConfig } from '@/config/loadConfig.js'

export type CliActions = ReturnType<typeof createActions<never>>

const ENS_FALLBACK_WARNING =
  'Warning: MAINNET_RPC_URL is unset; using the SDK public mainnet RPC fallback for ENS.\n'

export interface BaseContext {
  config: NodeActionsConfig<never>
  actions: CliActions
}

/**
 * @description Builds the tier-0 context for read-only CLI commands
 * (`assets`, `chains`). Loads the resolved config and constructs a fresh
 * `Actions` instance per invocation - the CLI runs as a short-lived
 * subprocess, so module-level singletons would only add startup surprise
 * without saving allocation cost. Does not read `PRIVATE_KEY`, so
 * `actions --help` and the no-wallet commands work with no env vars set.
 * @returns Base context bundle.
 */
export function baseContext(): BaseContext {
  const config = loadConfig()
  const actions = createActions<never>(config)
  installEnsFallbackWarning(actions, config)
  return { config, actions }
}

/**
 * @description Installs a CLI-only stderr warning on ENS calls that will use the SDK fallback RPC.
 * @param actions - Actions instance owned by the current CLI invocation.
 * @param config - Resolved CLI config for this process.
 * @returns Nothing.
 */
export function installEnsFallbackWarning(
  actions: CliActions,
  config: NodeActionsConfig<never>,
): void {
  if (config.chains.some((chain) => chain.chainId === mainnet.id)) return

  const ens = actions.ens
  const warnOnce = once(() => {
    process.stderr.write(ENS_FALLBACK_WARNING)
  })

  const getAddress = ens.getAddress.bind(ens)
  ens.getAddress = async (...args: Parameters<typeof ens.getAddress>) => {
    warnOnce()
    return getAddress(...args)
  }

  const getName = ens.getName.bind(ens)
  ens.getName = async (...args: Parameters<typeof ens.getName>) => {
    warnOnce()
    return getName(...args)
  }

  const getInfo = ens.getInfo.bind(ens)
  ens.getInfo = async (...args: Parameters<typeof ens.getInfo>) => {
    warnOnce()
    return getInfo(...args)
  }
}

function once(fn: () => void): () => void {
  let called = false
  return () => {
    if (called) return
    called = true
    fn()
  }
}
