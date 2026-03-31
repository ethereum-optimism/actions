import type { ConnectedWallet } from '@privy-io/react-auth'
import type { Address, LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type { LendProviders, SwapProviders } from '@/types/providers.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'
import { createSigner } from '@/wallet/react/wallets/hosted/privy/utils/createSigner.js'

/**
 * Privy wallet implementation
 * @description Wallet implementation using Privy service
 */
export class PrivyWallet extends EOAWallet {
  public address!: Address
  public signer!: LocalAccount

  private readonly connectedWallet: ConnectedWallet

  private constructor(
    chainManager: ChainManager,
    connectedWallet: ConnectedWallet,
    lendProviders?: LendProviders,
    swapProviders?: SwapProviders,
    supportedAssets?: Asset[],
  ) {
    super(chainManager, lendProviders, swapProviders, supportedAssets)
    this.connectedWallet = connectedWallet
  }

  static async create(params: {
    chainManager: ChainManager
    connectedWallet: ConnectedWallet
    lendProviders?: LendProviders
    swapProviders?: SwapProviders
    supportedAssets?: Asset[]
  }): Promise<PrivyWallet> {
    const wallet = new PrivyWallet(
      params.chainManager,
      params.connectedWallet,
      params.lendProviders,
      params.swapProviders,
      params.supportedAssets,
    )
    await wallet.initialize()
    return wallet
  }

  /**
   * Initialize the PrivyWallet by creating the signer account
   */
  protected async performInitialization() {
    this.signer = await this.createSigner()
    this.address = this.signer.address
  }

  /**
   * Create a LocalAccount from this Privy wallet
   * @description Converts the Privy wallet into a viem-compatible LocalAccount that can sign
   * messages and transactions. The returned account uses Privy's signing infrastructure
   * under the hood while providing a standard viem interface.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   * @throws Error if wallet retrieval fails or signing operations are not supported
   */
  private async createSigner(): Promise<LocalAccount> {
    return createSigner({
      connectedWallet: this.connectedWallet,
    })
  }
}
