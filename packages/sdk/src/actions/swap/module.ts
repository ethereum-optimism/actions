import type {
  ActionModule,
  ActionModuleDeps,
} from '@/actions/shared/ActionModule.js'
import {
  UniswapSwapProvider,
  VelodromeSwapProvider,
} from '@/actions/swap/index.js'
import { ActionsSwapNamespace } from '@/actions/swap/namespaces/ActionsSwapNamespace.js'
import { WalletSwapNamespace } from '@/actions/swap/namespaces/WalletSwapNamespace.js'
import { EnsNamespace } from '@/services/nameservices/ens/index.js'
import type { RecipientResolver } from '@/services/nameservices/ens/utils.js'
import type { SwapProviders } from '@/types/providers.js'

/**
 * Resolve the recipient resolver for swap namespaces. Prefers a caller-
 * supplied ENS namespace (used by `Actions` which already owns one);
 * otherwise builds a fresh one from the chain manager, mirroring the
 * legacy in-`Wallet` construction.
 */
function buildResolveRecipient(deps: ActionModuleDeps): RecipientResolver {
  const ens = deps.ens ?? new EnsNamespace(deps.chainManager)
  return (r) => (r ? ens.getAddress(r) : Promise.resolve(undefined))
}

/**
 * Swap action module: wraps the existing swap class graph for the
 * generic `ActionModule` registry. Reads the ENS resolver from
 * `deps.ens`; falls back to a pass-through resolver when ENS is not
 * configured (which is also what `BaseSwapNamespace` does internally).
 */
export const swapModule: ActionModule<'swap'> = {
  name: 'swap',
  buildProviders(config, deps) {
    const providers: SwapProviders = {}
    if (!config) return providers
    const settings = config.settings
    if (config.uniswap) {
      providers.uniswap = new UniswapSwapProvider(
        config.uniswap,
        deps.chainManager,
        settings,
      )
    }
    if (config.velodrome) {
      providers.velodrome = new VelodromeSwapProvider(
        config.velodrome,
        deps.chainManager,
        settings,
      )
    }
    return providers
  },
  isConfigured(providers) {
    return Object.values(providers).some(Boolean)
  },
  buildActionsNamespace(providers, deps, settings) {
    return new ActionsSwapNamespace(
      providers,
      buildResolveRecipient(deps),
      settings,
    )
  },
  buildWalletNamespace(providers, wallet, settings, deps) {
    return new WalletSwapNamespace(
      providers,
      wallet,
      buildResolveRecipient(deps),
      settings,
    )
  },
}
