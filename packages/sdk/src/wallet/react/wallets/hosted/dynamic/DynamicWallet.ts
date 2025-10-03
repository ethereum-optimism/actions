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
import type { DynamicHostedWalletToActionsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'
import { createSigner } from '@/wallet/react/wallets/hosted/dynamic/utils/createSigner.js'

/**
 * Dynamic wallet implementation
 * @description Wallet implementation using the Dynamic Labs wallet SDK.
 */
export class DynamicWallet extends Wallet {
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
  ) {
    super(chainManager)
    this.dynamicWallet = dynamicWallet
  }

  static async create(params: {
    dynamicWallet: DynamicHostedWalletToActionsWalletOptions['wallet']
    chainManager: ChainManager
  }): Promise<DynamicWallet> {
    const wallet = new DynamicWallet(params.chainManager, params.dynamicWallet)
    await wallet.initialize()
    return wallet
  }

  /**
   * Create a WalletClient for this Dynamic wallet
   * @description Creates a viem-compatible WalletClient configured with this wallet's account
   * and the specified chain. The returned client can be used to send transactions and interact
   * with smart contracts using Dynamic's signing infrastructure under the hood.
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
