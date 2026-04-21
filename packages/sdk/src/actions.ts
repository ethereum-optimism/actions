import { AaveLendProvider, MorphoLendProvider } from '@/actions/lend/index.js'
import { ActionsLendNamespace } from '@/actions/lend/namespaces/ActionsLendNamespace.js'
import {
  UniswapSwapProvider,
  VelodromeSwapProvider,
} from '@/actions/swap/index.js'
import { ActionsSwapNamespace } from '@/actions/swap/namespaces/ActionsSwapNamespace.js'
import { ChainManager } from '@/services/ChainManager.js'
import { EnsNamespace } from '@/services/nameservices/ens/index.js'
import type {
  ActionsConfig,
  AssetsConfig,
  LendProviders,
  SwapProviders,
  SwapSettings,
} from '@/types/actions.js'
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
  private _lend?: ActionsLendNamespace
  private _lendProviders: LendProviders = {}
  private _swap?: ActionsSwapNamespace
  private _swapProviders: SwapProviders = {}
  private _swapSettings?: SwapSettings
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

    if (config.lend?.morpho) {
      this._lendProviders.morpho = new MorphoLendProvider(
        config.lend.morpho,
        this.chainManager,
      )
    }
    if (config.lend?.aave) {
      this._lendProviders.aave = new AaveLendProvider(
        config.lend.aave,
        this.chainManager,
      )
    }
    if (this._lendProviders.morpho || this._lendProviders.aave) {
      this._lend = new ActionsLendNamespace(this._lendProviders)
    }

    const swapSettings = config.swap?.settings
    if (config.swap?.uniswap) {
      this._swapProviders.uniswap = new UniswapSwapProvider(
        config.swap.uniswap,
        this.chainManager,
        swapSettings,
      )
    }
    if (config.swap?.velodrome) {
      this._swapProviders.velodrome = new VelodromeSwapProvider(
        config.swap.velodrome,
        this.chainManager,
        swapSettings,
      )
    }
    this._swapSettings = swapSettings
    if (Object.values(this._swapProviders).some(Boolean)) {
      this._swap = new ActionsSwapNamespace(
        this._swapProviders,
        (r) => (r ? this._ens.getAddress(r) : Promise.resolve(undefined)),
        this._swapSettings,
      )
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
  get lendProviders(): LendProviders {
    return this._lendProviders
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
    if (!this._swap) {
      throw new Error(
        'Swap provider not configured. Please add swap configuration to ActionsConfig.',
      )
    }
    return this._swap
  }

  /**
   * Get the swap provider instances
   * @returns Object containing configured swap providers
   */
  get swapProviders(): SwapProviders {
    return this._swapProviders
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
        return new DefaultSmartWalletProvider(
          this.chainManager,
          this._lendProviders,
          this._swapProviders,
          this.getSupportedAssets(),
          config.smartWalletConfig.provider.attributionSuffix,
        )
      }
      throw new Error(
        `Unsupported smart wallet provider: ${config.smartWalletConfig.provider.type}`,
      )
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
      throw new Error(
        `Invalid options for hosted wallet provider: ${hostedWalletProviderConfig.type}`,
      )
    }
    return factory.create(
      {
        chainManager: this.chainManager,
        lendProviders: this._lendProviders,
        swapProviders: this._swapProviders,
        supportedAssets: this.getSupportedAssets(),
        swapSettings: this._swapSettings,
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
      lendProviders: this._lendProviders,
      swapProviders: this._swapProviders,
      supportedAssets: this.getSupportedAssets(),
      swapSettings: this._swapSettings,
    })
  }
}
