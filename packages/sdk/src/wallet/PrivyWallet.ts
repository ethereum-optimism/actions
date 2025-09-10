import type { PrivyClient } from '@privy-io/server-auth'
import {
  createViemAccount,
  type GetViemAccountInputType,
} from '@privy-io/server-auth/viem'
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
import { Wallet } from '@/wallet/base/Wallet.js'

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
   * @param verbs - Verbs instance for accessing configured providers
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

  // ⚠️  WARNING: TECH DEBT BELOW ⚠️
  // =====================================
  // The methods below this comment are legacy tech debt from the POC
  // and will most likely be REMOVED in a future refactor.
  //
  // DO NOT rely on these methods in production code!
  // DO NOT extend or modify these methods!
  //
  // If you need this functionality, please discuss with the team
  // before using or building upon these methods.
  // =====================================

  /**
   * Execute a lending operation (legacy method)
   * @description Lends assets using the configured lending provider with human-readable amounts
   * TODO: This will eventually become lend.execute()
   * @param amount - Human-readable amount to lend (e.g. 1.5)
   * @param asset - Asset symbol (e.g. 'usdc') or token address
   * @param marketId - Optional specific market ID or vault name
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   * @throws Error if no lending provider is configured
   */
  async lendExecute(
    amount: number,
    asset: AssetIdentifier,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    // Parse human-readable inputs
    // TODO: Get actual chain ID from wallet context, for now using Unichain
    const { amount: parsedAmount, asset: resolvedAsset } = parseLendParams(
      amount,
      asset,
      unichain.id,
    )

    // Set receiver to wallet address if not specified
    const lendOptions: LendOptions = {
      ...options,
      receiver: options?.receiver || this.address,
    }

    const result = await this.lendProvider.deposit(
      resolvedAsset.address,
      parsedAmount,
      marketId,
      lendOptions,
    )

    return result
  protected async performInitialization() {
    this.signer = await this.createAccount()
  }

  /**
   * Create a LocalAccount from this Privy wallet
   * @description Converts the Privy wallet into a viem-compatible LocalAccount that can sign
   * messages and transactions. The returned account uses Privy's signing infrastructure
   * under the hood while providing a standard viem interface.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   * @throws Error if wallet retrieval fails or signing operations are not supported
   */
  private async createAccount(): Promise<LocalAccount> {
    const account = await createViemAccount({
      walletId: this.walletId,
      address: this.address,
      // TODO: Fix this type error
      privy: this.privyClient as unknown as GetViemAccountInputType['privy'],
    })
    return account
  }
}
