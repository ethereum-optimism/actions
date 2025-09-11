import { bindLendProviderToVerbs } from '@/lend/bindings/verbsLendBinding.js'
import { LendProviderMorpho } from '@/lend/index.js'
import { ChainManager } from '@/services/ChainManager.js'
import type { LendProvider, LendReadOperations } from '@/types/lend.js'
import type { VerbsConfig } from '@/types/verbs.js'
import type { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'
import type { SmartWalletProvider } from '@/wallet/providers/base/SmartWalletProvider.js'
import { DefaultSmartWalletProvider } from '@/wallet/providers/DefaultSmartWalletProvider.js'
import { HostedWalletProviderRegistry } from '@/wallet/providers/HostedWalletProviderRegistry.js'
import { WalletNamespace } from '@/wallet/WalletNamespace.js'
import { WalletProvider } from '@/wallet/WalletProvider.js'

/**
 * Main Verbs SDK class
 * @description Core implementation of the Verbs SDK
 */
export class Verbs {
  public readonly wallet: WalletNamespace
  private _lend?: LendReadOperations
  private chainManager: ChainManager
  private lendProvider?: LendProvider
  private hostedWalletProvider!: HostedWalletProvider
  private smartWalletProvider!: SmartWalletProvider
  private hostedWalletProviderRegistry: HostedWalletProviderRegistry

  constructor(config: VerbsConfig) {
    this.chainManager = new ChainManager(config.chains)
    this.hostedWalletProviderRegistry = new HostedWalletProviderRegistry()

    // Create lending provider if configured
    if (config.lend) {
      if (config.lend.type === 'morpho') {
        this.lendProvider = new LendProviderMorpho(
          config.lend,
          this.chainManager,
        )

        // Bind read-only operations to verbs
        this._lend = bindLendProviderToVerbs(this.lendProvider)
      } else {
        throw new Error(
          `Unsupported lending provider type: ${config.lend.type}`,
        )
      }
    }

    this.wallet = this.createWalletNamespace(config.wallet)
  }

  /**
   * Get lend operations interface
   * @description Access to lending operations like markets and vault information.
   * Throws an error if no lend provider is configured in VerbsConfig.
   * @returns LendReadOperations interface for lending operations
   * @throws Error if lend provider not configured
   */
  get lend(): LendReadOperations {
    if (!this._lend) {
      throw new Error(
        'Lend provider not configured. Please add lend configuration to VerbsConfig.',
      )
    }
    return this._lend
  }

  /**
   * Get the lend provider instance (internal use)
   * @returns LendProvider instance if configured
   * @internal
   */
  get lendProviderInstance(): LendProvider {
    if (!this.lendProvider) {
      throw new Error('Lend provider not configured')
    }
    return this.lendProvider
  }

  /**
   * Create the wallet provider instance
   * @param config - Wallet configuration
   * @returns WalletProvider instance
   */
  private createWalletProvider(config: VerbsConfig['wallet']) {
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
        this.lendProviderInstance,
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
  private createWalletNamespace(config: VerbsConfig['wallet']) {
    const walletProvider = this.createWalletProvider(config)
    return new WalletNamespace(walletProvider)
  }
}
