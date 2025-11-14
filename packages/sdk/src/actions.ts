import type { LendProvider } from '@/lend/index.js'
import { AaveLendProvider, MorphoLendProvider } from '@/lend/index.js'
import { ActionsLendNamespace } from '@/lend/namespaces/ActionsLendNamespace.js'
import { ChainManager } from '@/services/ChainManager.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import type { ActionsConfig, AssetsConfig, LendProviderConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import { WalletNamespace } from '@/wallet/core/namespace/WalletNamespace.js'
import type { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { HostedWalletProviderRegistry } from '@/wallet/core/providers/hosted/registry/HostedWalletProviderRegistry.js'
import type { HostedWalletProvidersSchema } from '@/wallet/core/providers/hosted/types/index.js'
import type { SmartWalletProvider } from '@/wallet/core/providers/smart/abstract/SmartWalletProvider.js'
import { DefaultSmartWalletProvider } from '@/wallet/core/providers/smart/default/DefaultSmartWalletProvider.js'
import { WalletProvider } from '@/wallet/core/providers/WalletProvider.js'

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
  private _lend?: ActionsLendNamespace
  private _lendProviders: {
    morpho?: LendProvider<LendProviderConfig>
    aave?: LendProvider<LendProviderConfig>
  } = {}
  private _assetsConfig?: AssetsConfig
  private hostedWalletProvider!: THostedWalletProvidersSchema['providerInstances'][THostedWalletProviderType]
  private smartWalletProvider!: SmartWalletProvider
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

    // Create lending providers if configured
    if (config.lend) {
      if (config.lend.morpho) {
        this._lendProviders.morpho = new MorphoLendProvider(
          config.lend.morpho,
          this.chainManager,
        )
      }

      if (config.lend.aave) {
        this._lendProviders.aave = new AaveLendProvider(
          config.lend.aave,
          this.chainManager,
        )
      }

      // Create lend namespace if any providers are configured
      if (this._lendProviders.morpho || this._lendProviders.aave) {
        this._lend = new ActionsLendNamespace(this._lendProviders)
      }
    }

    this.wallet = this.createWalletNamespace(config.wallet)
  }

  /**
   * Get lend operations interface
   * @description Access to lending operations like markets and vault information.
   * Throws an error if no lend provider is configured in ActionsConfig.
   * @returns ActionsLendNamespace for lending operations
   * @throws Error if lend provider not configured
   */
  get lend(): ActionsLendNamespace {
    if (!this._lend) {
      throw new Error(
        'Lend provider not configured. Please add lend configuration to ActionsConfig.',
      )
    }
    return this._lend
  }

  /**
   * Get the lend provider instances
   * @returns Object containing configured lend providers
   */
  get lendProviders(): {
    morpho?: LendProvider<LendProviderConfig>
    aave?: LendProvider<LendProviderConfig>
  } {
    return this._lendProviders
  }

  /**
   * Get the list of supported assets based on configuration
   * @description Returns filtered assets based on allow/block lists in assets config.
   * If no config provided, returns all SUPPORTED_TOKENS.
   * @returns Array of supported assets
   */
  public getSupportedAssets(): Asset[] {
    // If no assets config, return all supported tokens
    if (!this._assetsConfig) {
      return SUPPORTED_TOKENS
    }

    // If allow list provided, return only those
    if (this._assetsConfig.allow && this._assetsConfig.allow.length > 0) {
      return this._assetsConfig.allow
    }

    // If block list provided, filter out blocked assets
    if (this._assetsConfig.block && this._assetsConfig.block.length > 0) {
      const blockedAddresses = new Set(
        this._assetsConfig.block.flatMap((asset) =>
          Object.values(asset.address).map((addr) => addr.toLowerCase()),
        ),
      )
      return SUPPORTED_TOKENS.filter((token) => {
        const tokenAddresses = Object.values(token.address).map((addr) =>
          addr.toLowerCase(),
        )
        return !tokenAddresses.some((addr) => blockedAddresses.has(addr))
      })
    }

    // Default to all supported tokens
    return SUPPORTED_TOKENS
  }

  /**
   * Create the wallet provider instance
   * @param config - Wallet configuration
   * @returns WalletProvider instance
   */
  private createWalletProvider(
    config: ActionsConfig<
      THostedWalletProviderType,
      THostedWalletProvidersSchema['providerConfigs']
    >['wallet'],
  ): WalletProvider<
    THostedWalletProviderType,
    THostedWalletProvidersSchema['providerToActionsOptions'],
    THostedWalletProvidersSchema['providerInstances'][THostedWalletProviderType],
    SmartWalletProvider
  > {
    const hostedWalletProviderConfig = config.hostedWalletConfig.provider
    const factory = this.hostedWalletProviderRegistry.getFactory(
      hostedWalletProviderConfig.type,
    )
    const options = (
      'config' in hostedWalletProviderConfig
        ? hostedWalletProviderConfig.config
        : undefined
    ) as unknown
    if (!factory.validateOptions(options)) {
      throw new Error(
        `Invalid options for hosted wallet provider: ${hostedWalletProviderConfig.type}`,
      )
    }
    this.hostedWalletProvider = factory.create(
      { chainManager: this.chainManager, lendProviders: this._lendProviders },
      options,
    )

    if (
      !config.smartWalletConfig ||
      config.smartWalletConfig.provider.type === 'default'
    ) {
      this.smartWalletProvider = new DefaultSmartWalletProvider(
        this.chainManager,
        this._lendProviders,
        config.smartWalletConfig.provider.attributionSuffix,
      )
    } else {
      throw new Error(
        `Unsupported smart wallet provider: ${config.smartWalletConfig.provider.type}`,
      )
    }

    const walletProvider = new WalletProvider(
      this.hostedWalletProvider,
      this.smartWalletProvider,
    )

    return walletProvider
  }

  /**
   * Create the wallet namespace instance
   * @param config - Wallet configuration
   * @returns WalletNamespace instance
   */
  private createWalletNamespace(
    config: ActionsConfig<
      THostedWalletProviderType,
      THostedWalletProvidersSchema['providerConfigs']
    >['wallet'],
  ) {
    const walletProvider = this.createWalletProvider(config)
    return new WalletNamespace<
      THostedWalletProviderType,
      THostedWalletProvidersSchema['providerToActionsOptions'],
      THostedWalletProvidersSchema['providerInstances'][THostedWalletProviderType],
      SmartWalletProvider
    >(walletProvider)
  }
}
