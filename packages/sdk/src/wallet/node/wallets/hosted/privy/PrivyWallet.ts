import type { AuthorizationContext, PrivyClient } from '@privy-io/node'
import { type Address, type LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { LendConfig, LendProvider } from '@/types/lend/index.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'
import { createSigner } from '@/wallet/node/wallets/hosted/privy/utils/createSigner.js'

/**
 * Privy wallet implementation
 * @description Wallet implementation using Privy service
 */
export class PrivyWallet extends EOAWallet {
  public walletId: string
  public signer!: LocalAccount
  public readonly address: Address
  private privyClient: PrivyClient
  private authorizationContext: AuthorizationContext
  /**
   * Create a new Privy wallet provider
   * @param appId - Privy application ID
   * @param appSecret - Privy application secret
   * @param actions - Actions instance for accessing configured providers
   */
  private constructor(
    privyClient: PrivyClient,
    authorizationContext: AuthorizationContext,
    walletId: string,
    address: Address,
    chainManager: ChainManager,
    lendProvider?: LendProvider<LendConfig>,
  ) {
    super(chainManager, lendProvider)
    this.privyClient = privyClient
    this.authorizationContext = authorizationContext
    this.walletId = walletId
    this.address = address
  }

  static async create(params: {
    privyClient: PrivyClient
    authorizationContext: AuthorizationContext
    walletId: string
    address: Address
    chainManager: ChainManager
    lendProvider?: LendProvider<LendConfig>
  }): Promise<PrivyWallet> {
    const wallet = new PrivyWallet(
      params.privyClient,
      params.authorizationContext,
      params.walletId,
      params.address,
      params.chainManager,
      params.lendProvider,
    )
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
