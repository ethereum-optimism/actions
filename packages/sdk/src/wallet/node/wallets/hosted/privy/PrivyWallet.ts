import type { AuthorizationContext, PrivyClient } from '@privy-io/node'
import { type Address, type LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type {
  ActionProvidersMap,
  ActionSettingsMap,
} from '@/types/actionRegistry.js'
import type { Asset } from '@/types/asset.js'
import type { LendProviders, SwapProviders } from '@/types/providers.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'
import { createSigner } from '@/wallet/node/wallets/hosted/privy/utils/createSigner.js'

interface PrivyWalletCreateOptions {
  privyClient: PrivyClient
  authorizationContext?: AuthorizationContext
  walletId: string
  address: Address
  chainManager: ChainManager
  actionProviders?: ActionProvidersMap
  actionSettings?: ActionSettingsMap
  lendProviders?: LendProviders
  swapProviders?: SwapProviders
  supportedAssets?: Asset[]
}

/**
 * Privy wallet implementation
 * @description Wallet implementation using Privy service
 */
export class PrivyWallet extends EOAWallet {
  public walletId: string
  public signer!: LocalAccount
  public readonly address: Address
  private privyClient: PrivyClient
  private authorizationContext?: AuthorizationContext

  private constructor(params: PrivyWalletCreateOptions) {
    super({
      chainManager: params.chainManager,
      actionProviders: params.actionProviders ?? {
        lend: params.lendProviders,
        swap: params.swapProviders,
      },
      actionSettings: params.actionSettings,
      supportedAssets: params.supportedAssets,
    })
    this.privyClient = params.privyClient
    this.authorizationContext = params.authorizationContext
    this.walletId = params.walletId
    this.address = params.address
  }

  static async create(params: PrivyWalletCreateOptions): Promise<PrivyWallet> {
    const wallet = new PrivyWallet(params)
    await wallet.initialize()
    return wallet
  }

  /**
   * Initialize the PrivyWallet by creating the signer account
   */
  protected async performInitialization() {
    this.signer = await this.createSigner()
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
      walletId: this.walletId,
      address: this.address,
      privyClient: this.privyClient,
      authorizationContext: this.authorizationContext,
    })
  }
}
