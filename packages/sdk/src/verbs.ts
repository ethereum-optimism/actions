import { createPublicClient, http, type PublicClient } from 'viem'
import { mainnet, optimism, unichain } from 'viem/chains'

import { LendProviderMorpho } from '@/lend/index.js'
import { ChainManager } from '@/services/ChainManager.js'
import type { LendProvider } from '@/types/lend.js'
import type { VerbsConfig, VerbsInterface } from '@/types/verbs.js'
import type {
  GetAllWalletsOptions,
  Wallet,
  WalletProvider,
} from '@/types/wallet.js'
import { WalletProviderPrivy } from '@/wallet/providers/privy.js'

/**
 * Main Verbs SDK class
 * @description Core implementation of the Verbs SDK
 */
export class Verbs implements VerbsInterface {
  // TODO Move to wallet provider
  createWallet!: (userId: string) => Promise<Wallet>
  getWallet!: (userId: string) => Promise<Wallet | null>
  getAllWallets!: (options?: GetAllWalletsOptions) => Promise<Wallet[]>

  private walletProvider: WalletProvider
  private chainManager: ChainManager
  private lendProvider?: LendProvider

  constructor(config: VerbsConfig) {
    this.chainManager = new ChainManager([
      {
        chainId: unichain.id,
        rpcUrl: unichain.rpcUrls.default.http[0],
      },
    ])
    // Create lending provider if configured
    if (config.lend) {
      const chainId = config.chainId || 130 // Default to Unichain
      const chain =
        chainId === 10 ? optimism : chainId === 130 ? unichain : mainnet
      const publicClient = createPublicClient({
        chain,
        transport: http(config.rpcUrl),
      }) as PublicClient
      if (config.lend.type === 'morpho') {
        this.lendProvider = new LendProviderMorpho(config.lend, publicClient)
      } else {
        throw new Error(
          `Unsupported lending provider type: ${config.lend.type}`,
        )
      }
    }

    this.walletProvider = this.createWalletProvider(config)

    // Delegate wallet methods to wallet provider
    this.createWallet = this.walletProvider.createWallet.bind(
      this.walletProvider,
    )
    this.getWallet = this.walletProvider.getWallet.bind(this.walletProvider)
    this.getAllWallets = this.walletProvider.getAllWallets.bind(
      this.walletProvider,
    )
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

  private createWalletProvider(config: VerbsConfig): WalletProvider {
    const { wallet } = config

    switch (wallet.type) {
      case 'privy':
        return new WalletProviderPrivy(
          wallet.appId,
          wallet.appSecret,
          this.chainManager,
          this.lendProvider,
        )
      default:
        throw new Error(`Unsupported wallet provider type: ${wallet.type}`)
    }
  }
}

/**
 * Initialize Verbs SDK
 * @description Factory function to create a new Verbs SDK instance
 * @param config - SDK configuration
 * @returns Initialized Verbs SDK instance
 */
export function initVerbs(config: VerbsConfig): VerbsInterface {
  return new Verbs(config)
}
