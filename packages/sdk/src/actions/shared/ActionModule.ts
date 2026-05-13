import type { ChainManager } from '@/services/ChainManager.js'
import type { EnsNamespace } from '@/services/nameservices/ens/index.js'
import type { ActionModules, ActionName } from '@/types/actionRegistry.js'
import type { Asset } from '@/types/asset.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Construction-time dependencies handed to every action module.
 * @description Anything that's universal across actions belongs here.
 * Action-specific dependencies (Morpho registry, Uniswap routers, etc.)
 * stay inside each module's implementation files.
 */
export interface ActionModuleDeps {
  chainManager: ChainManager
  /** Required for swap recipient resolution; optional for other actions. */
  ens?: EnsNamespace
  /** Allowlisted assets resolved from `ActionsConfig.assets`. */
  supportedAssets?: Asset[]
}

/**
 * Runtime contract every action implements.
 * @description Lets `Actions` and `Wallet` iterate registered actions
 * generically. Each module knows how to build its own providers and
 * namespaces from user config; the host classes just drive the loop and
 * surface typed accessors.
 */
export interface ActionModule<K extends ActionName> {
  /** Action name (matches the key in `ActionModules`). */
  readonly name: K
  /**
   * Translate the user-facing config block into the per-action provider
   * registry. Implementations should return an empty registry (`{}`) when
   * `config` is undefined or no providers were requested.
   */
  buildProviders(
    config: ActionModules[K]['config'] | undefined,
    deps: ActionModuleDeps,
  ): ActionModules[K]['providers']
  /**
   * Returns `true` when at least one provider in the registry is non-null.
   * Drives the conditional namespace instantiation in `Actions`/`Wallet`.
   */
  isConfigured(providers: ActionModules[K]['providers']): boolean
  /**
   * Build the read-only `actions.<name>` namespace from configured
   * providers. Optional for actions that only expose wallet behavior.
   */
  buildActionsNamespace?(
    providers: ActionModules[K]['providers'],
    deps: ActionModuleDeps,
    settings: ActionModules[K]['settings'] | undefined,
  ): ActionModules[K]['actionsNamespace']
  /**
   * Build the wallet-bound `wallet.<name>` namespace. Optional for
   * read-only actions.
   */
  buildWalletNamespace?(
    providers: ActionModules[K]['providers'],
    wallet: Wallet,
    settings: ActionModules[K]['settings'] | undefined,
    deps: ActionModuleDeps,
  ): ActionModules[K]['walletNamespace']
}
