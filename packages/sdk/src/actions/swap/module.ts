import type { ActionModule } from '@/actions/shared/ActionModule.js'
import {
  UniswapSwapProvider,
  VelodromeSwapProvider,
} from '@/actions/swap/index.js'
import { ActionsSwapNamespace } from '@/actions/swap/namespaces/ActionsSwapNamespace.js'
import { WalletSwapNamespace } from '@/actions/swap/namespaces/WalletSwapNamespace.js'
import {
  passthroughResolver,
  type RecipientResolver,
} from '@/services/nameservices/ens/utils.js'
import type { SwapProviders } from '@/types/providers.js'

/**
 * Swap action module — wraps the existing swap class graph for the
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
    const ens = deps.ens
    const resolveRecipient: RecipientResolver = ens
      ? (r) => (r ? ens.getAddress(r) : Promise.resolve(undefined))
      : passthroughResolver
    return new ActionsSwapNamespace(providers, resolveRecipient, settings)
  },
  buildWalletNamespace(providers, wallet, settings, deps) {
    const ens = deps.ens
    const resolveRecipient: RecipientResolver = ens
      ? (r) => (r ? ens.getAddress(r) : Promise.resolve(undefined))
      : passthroughResolver
    return new WalletSwapNamespace(
      providers,
      wallet,
      resolveRecipient,
      settings,
    )
  },
}
