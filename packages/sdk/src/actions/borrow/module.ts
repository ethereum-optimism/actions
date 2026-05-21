import { ActionsBorrowNamespace } from '@/actions/borrow/namespaces/ActionsBorrowNamespace.js'
import { WalletBorrowNamespace } from '@/actions/borrow/namespaces/WalletBorrowNamespace.js'
import { MorphoBorrowProvider } from '@/actions/borrow/providers/morpho/MorphoBorrowProvider.js'
import type { ActionModule } from '@/actions/shared/ActionModule.js'
import type { BorrowProviders } from '@/types/providers.js'

/**
 * Borrow action module: wraps the existing borrow class graph for the
 * generic `ActionModule` registry.
 */
export const borrowModule: ActionModule<'borrow'> = {
  name: 'borrow',
  buildProviders(config, deps) {
    const providers: BorrowProviders = {}
    if (!config) return providers
    const settings = config.settings
    if (config.morpho) {
      providers.morpho = new MorphoBorrowProvider(
        config.morpho,
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
    return new ActionsBorrowNamespace(providers)
  },
  buildWalletNamespace(providers, wallet) {
    return new WalletBorrowNamespace(providers, wallet)
  },
}
