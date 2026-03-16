import type { LendProvider } from '@/lend/index.js'
import { AaveLendProvider, MorphoLendProvider } from '@/lend/index.js'
import { ActionsLendNamespace } from '@/lend/namespaces/ActionsLendNamespace.js'
import { ChainManager } from '@/services/ChainManager.js'
import type { SwapProvider } from '@/swap/index.js'
import { UniswapSwapProvider, VelodromeSwapProvider } from '@/swap/index.js'
import { ActionsSwapNamespace } from '@/swap/namespaces/ActionsSwapNamespace.js'
import type {
  ActionsConfig,
  AssetsConfig,
  LendProviderConfig,
  SwapProviderConfig,
} from '@/types/actions.js'
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
  private _swap?: ActionsSwapNamespace
  private _swapProviders: {
    uniswap?: SwapProvider<SwapProviderConfig>
    velodrome?: SwapProvider<SwapProviderConfig>
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

    if (config.swap?.uniswap) {
      this._swapProviders.uniswap = new UniswapSwapProvider(
        config.swap.uniswap,
        this.chainManager,
      )
    }
    if (config.swap?.velodrome) {
      this._swapProviders.velodrome = new VelodromeSwapProvider(
        config.swap.velodrome,
        this.chainManager,
      )
    }
    if (Object.values(this._swapProviders).some(Boolean)) {
      this._swap = new ActionsSwapNamespace(this._swapProviders)
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
  get swapProviders(): {
    uniswap?: SwapProvider<SwapProviderConfig>
    velodrome?: SwapProvider<SwapProviderConfig>
  } {
    return this._swapProviders
  }

  /**
   * Get the list of supported assets based on configuration
   * @description Returns filtered assets based on allow/block lists in assets config.
   * If no allow list provided, returns empty array.
   * @returns Array of supported assets
   */
  public getSupportedAssets(): Asset[] {
    const allow = this._assetsConfig?.allow ?? []
    const block = this._assetsConfig?.block

    if (!block?.length) {
      return allow
    }

    const resolveAddresses = (asset: Asset): string[] =>
      Object.values(asset.address)
        .filter(
          (addr): addr is Exclude<typeof addr, undefined | 'native'> =>
            addr !== undefined && addr !== 'native',
        )
        .map((addr) => addr.toLowerCase())

    const blockedAddresses = new Set(block.flatMap(resolveAddresses))

    return allow.filter((asset) => {
      const addresses = resolveAddresses(asset)
      return !addresses.some((addr) => blockedAddresses.has(addr))
    })
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
      {
        chainManager: this.chainManager,
        lendProviders: this._lendProviders,
        swapProviders: this._swapProviders,
        supportedAssets: this.getSupportedAssets(),
      },
      options,
    )

    if (
      !config.smartWalletConfig ||
      config.smartWalletConfig.provider.type === 'default'
    ) {
      this.smartWalletProvider = new DefaultSmartWalletProvider(
        this.chainManager,
        this._lendProviders,
        this._swapProviders,
        this.getSupportedAssets(),
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
