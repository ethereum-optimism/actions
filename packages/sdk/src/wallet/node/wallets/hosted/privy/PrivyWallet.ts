import type { PrivyClient } from '@privy-io/server-auth'
import {
  type Address,
  createWalletClient,
  fallback,
  http,
  type LocalAccount,
  type WalletClient,
} from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import { createSigner } from '@/wallet/node/wallets/hosted/privy/utils/createSigner.js'

/**
 * Privy wallet implementation
 * @description Wallet implementation using Privy service
 */
export class PrivyWallet extends Wallet {
  public walletId: string
  public signer!: LocalAccount
  public readonly address: Address
  private privyClient: PrivyClient

  /**
   * Create a new Privy wallet provider
   * @param appId - Privy application ID
   * @param appSecret - Privy application secret
   * @param actions - Actions instance for accessing configured providers
   */
  private constructor(
    privyClient: PrivyClient,
    walletId: string,
    address: Address,
    chainManager: ChainManager,
  ) {
    super(chainManager)
    this.privyClient = privyClient
    this.walletId = walletId
    this.address = address
  }

  static async create(params: {
    privyClient: PrivyClient
    walletId: string
    address: Address
    chainManager: ChainManager
  }): Promise<PrivyWallet> {
    const wallet = new PrivyWallet(
      params.privyClient,
      params.walletId,
      params.address,
      params.chainManager,
    )
    await wallet.initialize()
    return wallet
  }

  /**
   * Create a WalletClient for this Privy wallet
   * @description Creates a viem-compatible WalletClient configured with this wallet's account
   * and the specified chain. The returned client can be used to send transactions and interact
   * with smart contracts using Privy's signing infrastructure under the hood.
   * @param chainId - The chain ID to create the wallet client for
   * @returns Promise resolving to a WalletClient configured for the specified chain
   * @throws Error if chain is not supported or wallet client creation fails
   */
  async walletClient(chainId: SupportedChainId): Promise<WalletClient> {
    const rpcUrls = this.chainManager.getRpcUrls(chainId)
    return createWalletClient({
      account: this.signer,
      chain: this.chainManager.getChain(chainId),
      transport: rpcUrls?.length
        ? fallback(rpcUrls.map((rpcUrl) => http(rpcUrl)))
        : http(),
    })
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
    })
  }
}
