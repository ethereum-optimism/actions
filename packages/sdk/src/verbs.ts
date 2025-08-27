import { unichain } from 'viem/chains'

import { LendProviderMorpho } from '@/lend/index.js'
import { ChainManager } from '@/services/ChainManager.js'
import type { LendProvider } from '@/types/lend.js'
import type { VerbsConfig } from '@/types/verbs.js'

import type { EmbeddedWalletProvider } from './wallet/providers/base/EmbeddedWalletProvider.js'
import type { SmartWalletProvider } from './wallet/providers/base/SmartWalletProvider.js'
import { DefaultSmartWalletProvider } from './wallet/providers/DefaultSmartWalletProvider.js'
import { PrivyEmbeddedWalletProvider } from './wallet/providers/privy.js'
import { WalletNamespace } from './wallet/WalletNamespace.js'
import { WalletProvider } from './wallet/WalletProvider.js'

/**
 * Main Verbs SDK class
 * @description Core implementation of the Verbs SDK
 */
export class Verbs {
  public readonly wallet: WalletNamespace
  private _chainManager: ChainManager
  private lendProvider?: LendProvider
  private embeddedWalletProvider: EmbeddedWalletProvider
  private smartWalletProvider: SmartWalletProvider

  constructor(config: VerbsConfig) {
    this._chainManager = new ChainManager(
      config.chains || [
        {
          chainId: unichain.id,
          rpcUrl: unichain.rpcUrls.default.http[0],
        },
      ],
    )

    // Create lending provider if configured
    if (config.lend) {
      if (config.lend.type === 'morpho') {
        this.lendProvider = new LendProviderMorpho(
          config.lend,
          this.chainManager,
        )
      } else {
        throw new Error(
          `Unsupported lending provider type: ${config.lend.type}`,
        )
      }
    }

    if (config.wallet.embeddedWalletConfig.provider.type === 'privy') {
      this.embeddedWalletProvider = new PrivyEmbeddedWalletProvider(
        config.wallet.embeddedWalletConfig.provider.privyClient,
      )
    } else {
      throw new Error(
        `Unsupported embedded wallet provider: ${config.wallet.embeddedWalletConfig.provider.type}`,
      )
    }

    if (
      !config.wallet.smartWalletConfig ||
      config.wallet.smartWalletConfig.provider.type === 'default'
    ) {
      this.smartWalletProvider = new DefaultSmartWalletProvider(
        this.chainManager,
        this.lend,
      )
    } else {
      throw new Error(
        `Unsupported smart wallet provider: ${config.wallet.smartWalletConfig.provider.type}`,
      )
    }

    // Create unified wallet provider
    const walletProvider = new WalletProvider(
      this.embeddedWalletProvider,
      this.smartWalletProvider,
    )
    this.wallet = new WalletNamespace(walletProvider)
  }

  /**
   * Get the lend provider instance
   * @returns LendProvider instance if configured, undefined otherwise
   */
  get lend(): LendProvider {
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
}
