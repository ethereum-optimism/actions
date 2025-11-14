import type { AuthorizationContext, PrivyClient } from '@privy-io/node'
import { type Address, type LocalAccount } from 'viem'

import type { LendProvider } from '@/lend/core/LendProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
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
  private authorizationContext?: AuthorizationContext
  /**
   * Create a new Privy wallet instance
   * @param privyClient - Privy client instance for wallet operations
   * @param authorizationContext - Authorization context for signing requests
   * @param walletId - Privy wallet identifier
   * @param address - Ethereum address of the wallet
   * @param chainManager - Chain manager for multi-chain operations
   * @param lendProviders - Optional lend providers for DeFi operations
   */
  private constructor(
    privyClient: PrivyClient,
    walletId: string,
    address: Address,
    chainManager: ChainManager,
    lendProviders?: {
      morpho?: LendProvider<LendProviderConfig>
      aave?: LendProvider<LendProviderConfig>
    },
    authorizationContext?: AuthorizationContext,
  ) {
    super(chainManager, lendProviders)
    this.privyClient = privyClient
    this.authorizationContext = authorizationContext
    this.walletId = walletId
    this.address = address
  }

  static async create(params: {
    privyClient: PrivyClient
    authorizationContext?: AuthorizationContext
    walletId: string
    address: Address
    chainManager: ChainManager
    lendProviders?: {
      morpho?: LendProvider<LendProviderConfig>
      aave?: LendProvider<LendProviderConfig>
    }
  }): Promise<PrivyWallet> {
    const wallet = new PrivyWallet(
      params.privyClient,
      params.walletId,
      params.address,
      params.chainManager,
      params.lendProviders,
      params.authorizationContext,
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
