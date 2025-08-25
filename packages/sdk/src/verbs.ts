import { unichain } from 'viem/chains'

import { LendProviderMorpho } from '@/lend/index.js'
import { ChainManager } from '@/services/ChainManager.js'
import type { LendProvider } from '@/types/lend.js'
import type { VerbsConfig } from '@/types/verbs.js'

import { WalletNamespace } from './wallet/WalletNamespace.js'

/**
 * Main Verbs SDK class
 * @description Core implementation of the Verbs SDK
 */
export class Verbs {
  public readonly wallet: WalletNamespace
  private _chainManager: ChainManager
  private lendProvider?: LendProvider

  constructor(config: VerbsConfig) {
    this.wallet = new WalletNamespace()
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

/**
 * Initialize Verbs SDK
 * @description Factory function to create a new Verbs SDK instance
 * @param config - SDK configuration
 * @returns Initialized Verbs SDK instance
 */
export function initVerbs(config: VerbsConfig) {
  const verbs = new Verbs(config)
  if (config.wallet) {
    verbs.wallet.withPrivy(
      config.wallet.appId,
      config.wallet.appSecret,
      verbs.chainManager,
    )
  }
  if (config.bundlerUrl) {
    verbs.wallet.withSmartWallet(
      verbs.chainManager,
      config.bundlerUrl,
      verbs.lend,
    )
  }

  return verbs
}
