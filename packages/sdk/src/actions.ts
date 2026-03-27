import type { LendProvider } from '@/lend/index.js'
import { AaveLendProvider, MorphoLendProvider } from '@/lend/index.js'
import { ActionsLendNamespace } from '@/lend/namespaces/ActionsLendNamespace.js'
import { ChainManager } from '@/services/ChainManager.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import type { SwapProvider } from '@/swap/index.js'
import { UniswapSwapProvider } from '@/swap/index.js'
import { ActionsSwapNamespace } from '@/swap/namespaces/ActionsSwapNamespace.js'
import type {
  ActionsConfig,
  AssetsConfig,
  LendProviderConfig,
  SwapProviderConfig,
} from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import { WalletNamespace } from '@/wallet/core/namespace/WalletNamespace.js'
import type { EmbeddedWalletProvider } from '@/wallet/core/providers/embedded/abstract/EmbeddedWalletProvider.js'
import type { EmbeddedWalletProviderRegistry } from '@/wallet/core/providers/embedded/registry/EmbeddedWalletProviderRegistry.js'
import type { EmbeddedWalletProvidersSchema } from '@/wallet/core/providers/embedded/types/index.js'
import type { SmartWalletProvider } from '@/wallet/core/providers/smart/abstract/SmartWalletProvider.js'
import { DefaultSmartWalletProvider } from '@/wallet/core/providers/smart/default/DefaultSmartWalletProvider.js'
import { WalletProvider } from '@/wallet/core/providers/WalletProvider.js'

/**
 * Main Actions SDK class
 * @description Core implementation of the Actions SDK
 */
export class Actions<
  TEmbeddedWalletProviderConfigKeys extends string,
  TEmbeddedWalletProvidersSchema extends EmbeddedWalletProvidersSchema<
    TEmbeddedWalletProviderConfigKeys,
    {
      [K in TEmbeddedWalletProviderConfigKeys]: EmbeddedWalletProvider<
        K,
        { [K in TEmbeddedWalletProviderConfigKeys]: unknown }
      >
    },
    { [K in TEmbeddedWalletProviderConfigKeys]: unknown },
    { [K in TEmbeddedWalletProviderConfigKeys]: unknown }
  >,
  TEmbeddedWalletProviderType extends TEmbeddedWalletProviderConfigKeys,
> {
  public readonly wallet: WalletNamespace<
    TEmbeddedWalletProviderType,
    TEmbeddedWalletProvidersSchema['providerToActionsOptions'],
    TEmbeddedWalletProvidersSchema['providerInstances'][TEmbeddedWalletProviderType],
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
  } = {}
  private _assetsConfig?: AssetsConfig
  private embeddedWalletProvider!: TEmbeddedWalletProvidersSchema['providerInstances'][TEmbeddedWalletProviderType]
  private smartWalletProvider!: SmartWalletProvider
  private embeddedWalletProviderRegistry: EmbeddedWalletProviderRegistry<
    TEmbeddedWalletProvidersSchema['providerInstances'],
    TEmbeddedWalletProvidersSchema['providerConfigs'],
    TEmbeddedWalletProvidersSchema['providerTypes']
  >
  constructor(
    config: ActionsConfig<
      TEmbeddedWalletProviderType,
      TEmbeddedWalletProvidersSchema['providerConfigs']
    >,
    deps: {
      embeddedWalletProviderRegistry: EmbeddedWalletProviderRegistry<
        TEmbeddedWalletProvidersSchema['providerInstances'],
        TEmbeddedWalletProvidersSchema['providerConfigs'],
        TEmbeddedWalletProvidersSchema['providerTypes']
      >
    },
  ) {
    this.chainManager = new ChainManager(config.chains)
    this.embeddedWalletProviderRegistry = deps.embeddedWalletProviderRegistry
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
  } {
    return this._swapProviders
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
      TEmbeddedWalletProviderType,
      TEmbeddedWalletProvidersSchema['providerConfigs']
    >['wallet'],
  ): WalletProvider<
    TEmbeddedWalletProviderType,
    TEmbeddedWalletProvidersSchema['providerToActionsOptions'],
    TEmbeddedWalletProvidersSchema['providerInstances'][TEmbeddedWalletProviderType],
    SmartWalletProvider
  > {
    const embeddedWalletProviderConfig = config.embeddedWalletConfig.provider
    const factory = this.embeddedWalletProviderRegistry.getFactory(
      embeddedWalletProviderConfig.type,
    )
    const options = (
      'config' in embeddedWalletProviderConfig
        ? embeddedWalletProviderConfig.config
        : undefined
    ) as unknown
    if (!factory.validateOptions(options)) {
      throw new Error(
        `Invalid options for embedded wallet provider: ${embeddedWalletProviderConfig.type}`,
      )
    }
    this.embeddedWalletProvider = factory.create(
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
      this.embeddedWalletProvider,
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
      TEmbeddedWalletProviderType,
      TEmbeddedWalletProvidersSchema['providerConfigs']
    >['wallet'],
  ) {
    const walletProvider = this.createWalletProvider(config)
    return new WalletNamespace<
      TEmbeddedWalletProviderType,
      TEmbeddedWalletProvidersSchema['providerToActionsOptions'],
      TEmbeddedWalletProvidersSchema['providerInstances'][TEmbeddedWalletProviderType],
      SmartWalletProvider
    >(walletProvider)
  }
}
