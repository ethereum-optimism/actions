import type { ActionsBorrowNamespace } from '@/actions/borrow/namespaces/ActionsBorrowNamespace.js'
import type { ActionsLendNamespace } from '@/actions/lend/namespaces/ActionsLendNamespace.js'
import { ACTION_MODULES, ACTION_NAMES } from '@/actions/registry.js'
import type {
  ActionModule,
  ActionModuleDeps,
} from '@/actions/shared/ActionModule.js'
import type { ActionsSwapNamespace } from '@/actions/swap/namespaces/ActionsSwapNamespace.js'
import { ProviderNotConfiguredError } from '@/core/error/errors.js'
import { ChainManager } from '@/services/ChainManager.js'
import { EnsNamespace } from '@/services/nameservices/ens/index.js'
import type {
  ActionModules,
  ActionName,
  ActionProvidersMap,
  ActionSettingsMap,
} from '@/types/actionRegistry.js'
import type { ActionsConfig, AssetsConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import { getAllAssetAddresses } from '@/utils/assets.js'
import { validateConfigAddresses } from '@/utils/validateAddresses.js'
import { WalletNamespace } from '@/wallet/core/namespace/WalletNamespace.js'
import type { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { HostedWalletProviderRegistry } from '@/wallet/core/providers/hosted/registry/HostedWalletProviderRegistry.js'
import type { HostedWalletProvidersSchema } from '@/wallet/core/providers/hosted/types/index.js'
import type { SmartWalletProvider } from '@/wallet/core/providers/smart/abstract/SmartWalletProvider.js'
import { DefaultSmartWalletProvider } from '@/wallet/core/providers/smart/default/DefaultSmartWalletProvider.js'
import { WalletProvider } from '@/wallet/core/providers/WalletProvider.js'

type ActionsNamespacesMap = {
  [K in ActionName]?: ActionModules[K]['actionsNamespace']
}

/**
 * Main Actions SDK class
 * @description Core implementation of the Actions SDK
 */
export class Actions<
  THostedWalletProviderConfigKeys extends string,
  THostedWalletProvidersSchema extends HostedWalletProvidersSchema<
    THostedWalletProviderConfigKeys,
    {
      [K in THostedWalletProviderConfigKeys]: HostedWalletProvider<
        K,
        { [K in THostedWalletProviderConfigKeys]: unknown }
      >
    },
    { [K in THostedWalletProviderConfigKeys]: unknown },
    { [K in THostedWalletProviderConfigKeys]: unknown }
  >,
  THostedWalletProviderType extends THostedWalletProviderConfigKeys,
> {
  public readonly wallet: WalletNamespace<
    THostedWalletProviderType,
    THostedWalletProvidersSchema['providerToActionsOptions'],
    THostedWalletProvidersSchema['providerInstances'][THostedWalletProviderType],
    SmartWalletProvider
  >
  private chainManager: ChainManager
  private _ens: EnsNamespace
  private _actionProviders: ActionProvidersMap = {}
  private _actionSettings: ActionSettingsMap = {}
  private _actionsNamespaces: ActionsNamespacesMap = {}
  private _assetsConfig?: AssetsConfig
  private hostedWalletProviderRegistry: HostedWalletProviderRegistry<
    THostedWalletProvidersSchema['providerInstances'],
    THostedWalletProvidersSchema['providerConfigs'],
    THostedWalletProvidersSchema['providerTypes']
  >
  constructor(
    config: ActionsConfig<
      THostedWalletProviderType,
      THostedWalletProvidersSchema['providerConfigs']
    >,
    deps: {
      hostedWalletProviderRegistry: HostedWalletProviderRegistry<
        THostedWalletProvidersSchema['providerInstances'],
        THostedWalletProvidersSchema['providerConfigs'],
        THostedWalletProvidersSchema['providerTypes']
      >
    },
  ) {
    this.chainManager = new ChainManager(config.chains)
    this.hostedWalletProviderRegistry = deps.hostedWalletProviderRegistry
    this._assetsConfig = config.assets
    validateConfigAddresses(config)

    this._ens = new EnsNamespace(this.chainManager)

    // Iterate the action-module registry: each module builds its own
    // providers + namespace from its config block. Adding a new action is
    // a new entry in `ACTION_MODULES`; this loop doesn't change.
    const moduleDeps = {
      chainManager: this.chainManager,
      ens: this._ens,
      supportedAssets: this.getSupportedAssets(),
    }
    for (const name of ACTION_NAMES) {
      this.setupAction(name, config, moduleDeps)
    }

    this.wallet = this.createWalletNamespace(config.wallet)
  }

  /**
   * Build providers and (optionally) the read-only namespace for one action
   * module. Generic over `K` so the per-action types unify; the slot-write
   * casts are the one place TS can't follow the registry indirection.
   * Adding a future action is purely a new entry in `ACTION_MODULES` plus
   * any user-facing config field — this helper handles the rest.
   */
  private setupAction<K extends ActionName>(
    name: K,
    config: ActionsConfig<
      THostedWalletProviderType,
      THostedWalletProvidersSchema['providerConfigs']
    >,
    moduleDeps: ActionModuleDeps,
  ): void {
    const module = ACTION_MODULES[name] as ActionModule<K>
    const actionConfig = config[name]
    const providers = module.buildProviders(actionConfig, moduleDeps)
    this._actionProviders[name] = providers as ActionProvidersMap[K]
    this._actionSettings[name] = actionConfig?.settings
    if (module.isConfigured(providers) && module.buildActionsNamespace) {
      this._actionsNamespaces[name] = module.buildActionsNamespace(
        providers,
        moduleDeps,
        actionConfig?.settings,
      ) as ActionsNamespacesMap[K]
    }
  }

  /**
   * Get lend operations interface
   * @description Access to lending operations like markets and vault information.
   * Throws an error if no lend provider is configured in ActionsConfig.
   * @returns ActionsLendNamespace for lending operations
   * @throws Error if lend provider not configured
   */
  get lend(): ActionsLendNamespace {
    return this.requireNamespace('lend')
  }

  /**
   * Get ENS operations interface
   * @description Access to Ethereum Name Service operations: resolve, reverseResolve, lookupText.
   * Requires Ethereum mainnet (chain ID 1) to be included in your chain configuration.
   * @returns EnsNamespace for ENS operations
   */
  get ens(): EnsNamespace {
    return this._ens
  }

  /**
   * Get swap operations interface
   * @description Access to swap operations like price quotes and markets.
   * Throws an error if no swap provider is configured in ActionsConfig.
   * @returns ActionsSwapNamespace for swap operations
   * @throws Error if swap provider not configured
   */
  get swap(): ActionsSwapNamespace {
    return this.requireNamespace('swap')
  }

  /**
   * Get borrow operations interface
   * @description Access to borrow operations like markets, position queries, and quotes.
   * Throws an error if no borrow provider is configured in ActionsConfig.
   * @returns ActionsBorrowNamespace for borrow operations
   * @throws Error if borrow provider not configured
   */
  get borrow(): ActionsBorrowNamespace {
    return this.requireNamespace('borrow')
  }

  /**
   * Get all configured provider instances keyed by action name.
   * @returns Action-keyed map of per-action provider maps
   */
  get actionProviders(): ActionProvidersMap {
    return this._actionProviders
  }

  /**
   * Get the list of supported assets based on configuration
   * @description Returns filtered assets based on allow/block lists in assets config.
   * If no config provided, returns empty array. Developers must explicitly configure
   * their supported assets via ActionsConfig.assets.allow.
   * @returns Array of supported assets
   */
  public getSupportedAssets(): Asset[] {
    if (!this._assetsConfig) {
      return []
    }

    const allow = this._assetsConfig.allow ?? []
    const block = this._assetsConfig.block

    if (!block?.length) {
      return allow
    }

    const blockedAddresses = new Set(block.flatMap(getAllAssetAddresses))

    return allow.filter((asset) => {
      const addresses = getAllAssetAddresses(asset)
      return !addresses.some((addr) => blockedAddresses.has(addr))
    })
  }
  /**
   * Narrow + return the read-only namespace for an action, throwing when
   * not configured. Single helper backs every typed accessor.
   */
  private requireNamespace<K extends ActionName>(
    name: K,
  ): ActionModules[K]['actionsNamespace'] {
    const ns = this._actionsNamespaces[name]
    if (!ns) {
      throw new ProviderNotConfiguredError({
        provider: name,
        details: `Please add ${name} configuration to ActionsConfig.`,
      })
    }
    return ns
  }

  /**
   * Create the wallet provider instance
   * @param config - Wallet configuration
   * @returns WalletProvider instance
   */
  private async createWalletProvider(
    config: ActionsConfig<
      THostedWalletProviderType,
      THostedWalletProvidersSchema['providerConfigs']
    >['wallet'],
  ): Promise<
    WalletProvider<
      THostedWalletProviderType,
      THostedWalletProvidersSchema['providerToActionsOptions'],
      THostedWalletProvidersSchema['providerInstances'][THostedWalletProviderType],
      SmartWalletProvider
    >
  > {
    const hostedWalletProvider = config.hostedWalletConfig
      ? await this.createHostedWalletProvider(config.hostedWalletConfig)
      : undefined

    const smartWalletProvider: SmartWalletProvider = (() => {
      if (
        !config.smartWalletConfig ||
        config.smartWalletConfig.provider.type === 'default'
      ) {
        return new DefaultSmartWalletProvider({
          chainManager: this.chainManager,
          actionProviders: this._actionProviders,
          actionSettings: this._actionSettings,
          supportedAssets: this.getSupportedAssets(),
          attributionSuffix:
            config.smartWalletConfig.provider.attributionSuffix,
        })
      }
      throw new ProviderNotConfiguredError({
        provider: config.smartWalletConfig.provider.type,
      })
    })()

    return new WalletProvider(hostedWalletProvider, smartWalletProvider)
  }

  private async createHostedWalletProvider(
    hostedWalletConfig: NonNullable<
      ActionsConfig<
        THostedWalletProviderType,
        THostedWalletProvidersSchema['providerConfigs']
      >['wallet']['hostedWalletConfig']
    >,
  ): Promise<
    THostedWalletProvidersSchema['providerInstances'][THostedWalletProviderType]
  > {
    const hostedWalletProviderConfig = hostedWalletConfig.provider
    const factory = this.hostedWalletProviderRegistry.getFactory(
      hostedWalletProviderConfig.type,
    )
    const options = (
      'config' in hostedWalletProviderConfig
        ? hostedWalletProviderConfig.config
        : undefined
    ) as unknown
    if (!factory.validateOptions(options)) {
      throw new ProviderNotConfiguredError({
        provider: hostedWalletProviderConfig.type,
        details: 'Invalid options',
      })
    }
    return factory.create(
      {
        chainManager: this.chainManager,
        actionProviders: this._actionProviders,
        actionSettings: this._actionSettings,
        supportedAssets: this.getSupportedAssets(),
      },
      options,
    )
  }

  /**
   * Create the wallet namespace instance
   * @description Creates a WalletNamespace with lazy provider initialization.
   * The wallet provider is not created until the first wallet method is called.
   * @param config - Wallet configuration
   * @returns WalletNamespace instance
   */
  private createWalletNamespace(
    config: ActionsConfig<
      THostedWalletProviderType,
      THostedWalletProvidersSchema['providerConfigs']
    >['wallet'],
  ) {
    const providerFactory = () => this.createWalletProvider(config)
    return new WalletNamespace<
      THostedWalletProviderType,
      THostedWalletProvidersSchema['providerToActionsOptions'],
      THostedWalletProvidersSchema['providerInstances'][THostedWalletProviderType],
      SmartWalletProvider
    >(providerFactory, {
      chainManager: this.chainManager,
      actionProviders: this._actionProviders,
      actionSettings: this._actionSettings,
      supportedAssets: this.getSupportedAssets(),
    })
  }
}
