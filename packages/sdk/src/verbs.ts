import { LendProviderMorpho } from '@/lend/index.js'
import { VerbsLendNamespace } from '@/lend/namespaces/VerbsLendNamespace.js'
import { ChainManager } from '@/services/ChainManager.js'
import type { LendProvider } from '@/types/lend.js'
import type { VerbsConfig } from '@/types/verbs.js'
import type { SmartWalletProvider } from '@/wallet/providers/base/SmartWalletProvider.js'
import { DefaultSmartWalletProvider } from '@/wallet/providers/DefaultSmartWalletProvider.js'
import type {
  HostedProviderInstanceMap,
  HostedProviderType,
} from '@/wallet/providers/hostedProvider.types.js'
import { HostedWalletProviderRegistry } from '@/wallet/providers/HostedWalletProviderRegistry.js'
import { WalletNamespace } from '@/wallet/WalletNamespace.js'
import { WalletProvider } from '@/wallet/WalletProvider.js'

/**
 * Main Verbs SDK class
 * @description Core implementation of the Verbs SDK
 */
export class Verbs<THostedWalletProviderType extends HostedProviderType> {
  public readonly wallet: WalletNamespace<
    HostedProviderInstanceMap[THostedWalletProviderType],
    SmartWalletProvider
  >
  private chainManager: ChainManager
  private _lend?: VerbsLendNamespace
  private _lendProvider?: LendProvider
  private hostedWalletProvider!: HostedProviderInstanceMap[THostedWalletProviderType]
  private smartWalletProvider!: SmartWalletProvider
  private hostedWalletProviderRegistry: HostedWalletProviderRegistry

  constructor(config: VerbsConfig<THostedWalletProviderType>) {
    this.chainManager = new ChainManager(config.chains)
    this.hostedWalletProviderRegistry = new HostedWalletProviderRegistry()

    // Create lending provider if configured
    if (config.lend) {
      if (config.lend.provider === 'morpho') {
        this._lendProvider = new LendProviderMorpho(
          config.lend,
          this.chainManager,
        )

        // Create read-only lend namespace
        this._lend = new VerbsLendNamespace(this._lendProvider)
      } else {
        throw new Error(`Unsupported lending provider: ${config.lend.provider}`)
      }
    }

    this.wallet = this.createWalletNamespace(config.wallet)
  }

  /**
   * Get lend operations interface
   * @description Access to lending operations like markets and vault information.
   * Throws an error if no lend provider is configured in VerbsConfig.
   * @returns VerbsLendNamespace for lending operations
   * @throws Error if lend provider not configured
   */
  get lend(): VerbsLendNamespace {
    if (!this._lend) {
      throw new Error(
        'Lend provider not configured. Please add lend configuration to VerbsConfig.',
      )
    }
    return this._lend
  }

  /**
   * Get the lend provider instance
   * @returns LendProvider instance if configured, undefined otherwise
   */
  get lendProvider(): LendProvider | undefined {
    return this._lendProvider
  }

  /**
   * Create the wallet provider instance
   * @param config - Wallet configuration
   * @returns WalletProvider instance
   */
  private createWalletProvider(
    config: VerbsConfig<THostedWalletProviderType>['wallet'],
  ) {
    const hostedWalletProviderConfig = config.hostedWalletConfig.provider
    const factory = this.hostedWalletProviderRegistry.getFactory(
      hostedWalletProviderConfig.type,
    )
    if (!factory.validateOptions(hostedWalletProviderConfig.config)) {
      throw new Error(
        `Invalid options for hosted wallet provider: ${hostedWalletProviderConfig.type}`,
      )
    }
    this.hostedWalletProvider = factory.create(
      { chainManager: this.chainManager },
      hostedWalletProviderConfig.config,
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
    config: VerbsConfig<THostedWalletProviderType>['wallet'],
  ) {
    const walletProvider = this.createWalletProvider(config)
    return new WalletNamespace(walletProvider)
  }
}
