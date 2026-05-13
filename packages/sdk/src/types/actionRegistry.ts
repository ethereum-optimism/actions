import type { ActionsBorrowNamespace } from '@/actions/borrow/namespaces/ActionsBorrowNamespace.js'
import type { WalletBorrowNamespace } from '@/actions/borrow/namespaces/WalletBorrowNamespace.js'
import type { ActionsLendNamespace } from '@/actions/lend/namespaces/ActionsLendNamespace.js'
import type { WalletLendNamespace } from '@/actions/lend/namespaces/WalletLendNamespace.js'
import type { ActionsSwapNamespace } from '@/actions/swap/namespaces/ActionsSwapNamespace.js'
import type { WalletSwapNamespace } from '@/actions/swap/namespaces/WalletSwapNamespace.js'
import type {
  BorrowConfig,
  BorrowSettings,
  LendConfig,
  LendSettings,
  SwapConfig,
  SwapSettings,
} from '@/types/actions.js'
import type {
  BorrowProviders,
  LendProviders,
  SwapProviders,
} from '@/types/providers.js'

/**
 * Type-level registry of every action the SDK ships.
 * @description Single source of truth for which actions exist and the types
 * each one contributes. Adding a new action (stake, bridge, restake, …) means
 * adding a new entry here and a matching `ActionModule` runtime object. The
 * rest of the codebase narrows against this interface — `Actions`, `Wallet`,
 * hosted-wallet providers, and registries all iterate the keys generically
 * rather than referencing each action by name.
 */
export interface ActionModules {
  lend: {
    config: LendConfig
    providers: LendProviders
    settings: LendSettings
    actionsNamespace: ActionsLendNamespace
    walletNamespace: WalletLendNamespace
  }
  swap: {
    config: SwapConfig
    providers: SwapProviders
    settings: SwapSettings
    actionsNamespace: ActionsSwapNamespace
    walletNamespace: WalletSwapNamespace
  }
  borrow: {
    config: BorrowConfig
    providers: BorrowProviders
    settings: BorrowSettings
    actionsNamespace: ActionsBorrowNamespace
    walletNamespace: WalletBorrowNamespace
  }
}

/** Names of every registered action. */
export type ActionName = keyof ActionModules

/** Optional per-action providers, keyed by action name. */
export type ActionProvidersMap = {
  [K in ActionName]?: ActionModules[K]['providers']
}

/** Optional per-action shared settings, keyed by action name. */
export type ActionSettingsMap = {
  [K in ActionName]?: ActionModules[K]['settings']
}

/** Optional per-action user-facing config, keyed by action name. */
export type ActionConfigMap = {
  [K in ActionName]?: ActionModules[K]['config']
}
