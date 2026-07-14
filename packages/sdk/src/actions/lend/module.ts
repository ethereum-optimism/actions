import { AaveLendProvider, MorphoLendProvider } from '@/actions/lend/index.js'
import { ActionsLendNamespace } from '@/actions/lend/namespaces/ActionsLendNamespace.js'
import { WalletLendNamespace } from '@/actions/lend/namespaces/WalletLendNamespace.js'
import type { ActionModule } from '@/actions/shared/ActionModule.js'
import type { LendProviders } from '@/types/providers.js'

/**
 * Lend action module: bridges the existing lend class graph to the
 * generic `ActionModule` contract so `Actions` and `Wallet` can iterate
 * actions uniformly.
 */
export const lendModule: ActionModule<'lend'> = {
  name: 'lend',
  buildProviders(config, deps) {
    const providers: LendProviders = {}
    if (!config) return providers
    const settings = config.settings
    if (config.morpho) {
      providers.morpho = new MorphoLendProvider(
        config.morpho,
        deps.chainManager,
        settings,
      )
    }
    if (config.aave) {
      providers.aave = new AaveLendProvider(
        config.aave,
        deps.chainManager,
        settings,
      )
    }
    return providers
  },
  isConfigured(providers) {
    return Object.values(providers).some(Boolean)
  },
  buildActionsNamespace(providers) {
    return new ActionsLendNamespace(providers)
  },
  buildWalletNamespace(providers, wallet) {
    return new WalletLendNamespace(providers, wallet)
  },
}
