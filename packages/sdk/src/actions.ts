import { DEFAULT_ACTIONS_CONFIG } from '@/constants/config.js'
import { MorphoLendProvider } from '@/lend/index.js'
import { ActionsLendNamespace } from '@/lend/namespaces/ActionsLendNamespace.js'
import { ChainManager } from '@/services/ChainManager.js'
import type { ActionsConfig } from '@/types/actions.js'
import type { LendConfig, LendProvider } from '@/types/lend/index.js'
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
  private _lend?: ActionsLendNamespace<LendConfig>
  private _lendProvider?: LendProvider<LendConfig>
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

    // Create lending provider if configured
    if (config.lend) {
      if (config.lend.provider === 'morpho') {
        this._lendProvider = new MorphoLendProvider(
          {
            ...config.lend,
            defaultSlippage:
              config.lend.defaultSlippage ??
              DEFAULT_ACTIONS_CONFIG.lend.defaultSlippage,
          },
          this.chainManager,
        )

        // Create read-only lend namespace
        this._lend = new ActionsLendNamespace(this._lendProvider!)
      } else {
        throw new Error(`Unsupported lending provider: ${config.lend.provider}`)
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
  get lend(): ActionsLendNamespace<LendConfig> {
    if (!this._lend) {
      throw new Error(
        'Lend provider not configured. Please add lend configuration to ActionsConfig.',
      )
    }
    return this._lend
  }

  /**
   * Get the lend provider instance
   * @returns LendProvider instance if configured, undefined otherwise
   */
  get lendProvider(): LendProvider<LendConfig> | undefined {
    return this._lendProvider
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
      { chainManager: this.chainManager, lendProvider: this.lendProvider },
      options,
    )

    if (
      !config.smartWalletConfig ||
      config.smartWalletConfig.provider.type === 'default'
    ) {
      this.smartWalletProvider = new DefaultSmartWalletProvider(
        this.chainManager,
        this.lendProvider,
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
