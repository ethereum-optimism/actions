import { createPublicClient, http, type PublicClient } from 'viem'
import { mainnet, optimism } from 'viem/chains'

import { createLendProvider } from './lend/index.js'
import type { LendProvider } from './types/lend.js'
import type { VerbsConfig, VerbsInterface } from './types/verbs.js'
import type { GetAllWalletsOptions, WalletProvider } from './types/wallet.js'
import type { Wallet } from './wallet/index.js'
import { WalletProviderPrivy } from './wallet/providers/privy.js'

// Unichain configuration
const unichain = {
  id: 130,
  name: 'Unichain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://mainnet.unichain.org/'] },
  },
  blockExplorers: {
    default: {
      name: 'Unichain Explorer',
      url: 'https://unichain.blockscout.com',
    },
  },
}

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
  private lendProvider?: LendProvider

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

  constructor(config: VerbsConfig) {
    // Create lending provider if configured
    if (config.lend) {
      const chainId = config.chainId || 130 // Default to Unichain
      const chain =
        chainId === 10 ? optimism : chainId === 130 ? unichain : mainnet
      const publicClient = createPublicClient({
        chain,
        transport: http(config.rpcUrl),
      }) as PublicClient
      this.lendProvider = createLendProvider(config.lend, publicClient)
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

  private createWalletProvider(config: VerbsConfig): WalletProvider {
    const { wallet } = config

    switch (wallet.type) {
      case 'privy':
        return new WalletProviderPrivy(
          wallet.appId,
          wallet.appSecret,
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
