import { type Address, type LocalAccount } from 'viem'

import type { LendProvider } from '@/lend/core/LendProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'
import type { DynamicHostedWalletToActionsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'
import { createSigner } from '@/wallet/react/wallets/hosted/dynamic/utils/createSigner.js'

/**
 * Dynamic wallet implementation
 * @description Wallet implementation using the Dynamic Labs wallet SDK.
 */
export class DynamicWallet extends EOAWallet {
  public signer!: LocalAccount
  public address!: Address
  private readonly dynamicWallet: DynamicHostedWalletToActionsWalletOptions['wallet']

  /**
   * Create a new Dynamic wallet
   * @param chainManager - Chain manager for RPC, chain info, and transports
   * @param dynamicWallet - Dynamic Labs wallet instance (EVM)
   */
  private constructor(
    chainManager: ChainManager,
    dynamicWallet: DynamicHostedWalletToActionsWalletOptions['wallet'],
    lendProviders?: {
      morpho?: LendProvider<LendProviderConfig>
      aave?: LendProvider<LendProviderConfig>
    },
  ) {
    super(chainManager, lendProviders)
    this.dynamicWallet = dynamicWallet
  }

  static async create(params: {
    dynamicWallet: DynamicHostedWalletToActionsWalletOptions['wallet']
    chainManager: ChainManager
    lendProviders?: {
      morpho?: LendProvider<LendProviderConfig>
      aave?: LendProvider<LendProviderConfig>
    }
  }): Promise<DynamicWallet> {
    const wallet = new DynamicWallet(
      params.chainManager,
      params.dynamicWallet,
      params.lendProviders,
    )
    await wallet.initialize()
    return wallet
  }

  /**
   * Initialize the DynamicWallet by creating the signer account
   */
  protected async performInitialization() {
    this.signer = await this.createSigner()
    this.address = this.signer.address
  }

  /**
   * Create a LocalAccount from this Dynamic wallet
   * @description Converts the Dynamic wallet into a viem-compatible LocalAccount that can sign
   * messages and transactions. The returned account uses Dynamic's signing infrastructure
   * under the hood while providing a standard viem interface.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   * @throws Error if wallet retrieval fails or signing operations are not supported
   */
  private async createSigner(): Promise<LocalAccount> {
    return createSigner({
      wallet: this.dynamicWallet,
    })
  }
}
