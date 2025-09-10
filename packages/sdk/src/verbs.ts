import { bindLendProviderToVerbs } from '@/lend/bindings/verbsLendBinding.js'
import { LendProviderMorpho } from '@/lend/index.js'
import { ChainManager } from '@/services/ChainManager.js'
import type { LendProvider, LendReadOperations } from '@/types/lend.js'
import type { VerbsConfig } from '@/types/verbs.js'
import type { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'
import type { SmartWalletProvider } from '@/wallet/providers/base/SmartWalletProvider.js'
import { DefaultSmartWalletProvider } from '@/wallet/providers/DefaultSmartWalletProvider.js'
import { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'
import { WalletNamespace } from '@/wallet/WalletNamespace.js'
import { WalletProvider } from '@/wallet/WalletProvider.js'

/**
 * Main Verbs SDK class
 * @description Core implementation of the Verbs SDK
 */
export class Verbs {
  public readonly wallet: WalletNamespace
  public readonly lend?: LendReadOperations
  private _chainManager: ChainManager
  private lendProvider?: LendProvider
  private hostedWalletProvider!: HostedWalletProvider
  private smartWalletProvider!: SmartWalletProvider

  constructor(config: VerbsConfig) {
    this._chainManager = new ChainManager(config.chains)

    // Create lending provider if configured
    if (config.lend) {
      if (config.lend.type === 'morpho') {
        this.lendProvider = new LendProviderMorpho(
          config.lend,
          this.chainManager,
        )
        
        // Bind read-only operations to verbs
        this.lend = bindLendProviderToVerbs(this.lendProvider)
      } else {
        throw new Error(
          `Unsupported lending provider type: ${config.lend.type}`,
        )
      }
    }

    this.wallet = this.createWalletNamespace(config.wallet)
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
   * Get the chain manager instance
   * @returns ChainManager instance for multi-chain operations
   */
  get chainManager(): ChainManager {
    return this._chainManager
  }

  /**
   * Create the wallet provider instance
   * @param config - Wallet configuration
   * @returns WalletProvider instance
   */
  private createWalletProvider(config: VerbsConfig['wallet']) {
    if (config.hostedWalletConfig.provider.type === 'privy') {
      this.hostedWalletProvider = new PrivyHostedWalletProvider(
        config.hostedWalletConfig.provider.privyClient,
        this._chainManager,
        this.lendProvider!,
      )
    } else {
      throw new Error(
        `Unsupported hosted wallet provider: ${config.hostedWalletConfig.provider.type}`,
      )
    }

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
