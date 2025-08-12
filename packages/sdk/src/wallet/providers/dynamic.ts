// @ts-ignore - Package has broken exports
// import { DynamicEvmWalletClient } from '@dynamic-labs-wallet/node-evm'
import { getAddress, type Hash } from 'viem'

import type { TransactionData } from '@/index.js'
import { Wallet } from '@/index.js'
import type { VerbsInterface } from '@/types/verbs.js'
import type { WalletProvider } from '@/types/wallet.js'

// @ts-ignore - Package has broken exports
const { DynamicEvmWalletClient } = require('@dynamic-labs-wallet/node-evm')

// Environment configuration
const BASE_API_URL = 'https://app.dynamicauth.com'
const MPC_RELAY_URL = 'https://relay.dynamicauth.com'

/**
 * Dynamic wallet provider
 * @description Wallet provider implementation that uses Dynamic.xyz
 */
export class Dynamic implements WalletProvider {
  private verbs: VerbsInterface
  private authToken: string
  private client: typeof DynamicEvmWalletClient
  private initialized: boolean = false

  constructor(authToken: string, verbs: VerbsInterface) {
    this.verbs = verbs
    this.authToken = authToken
    this.client = new DynamicEvmWalletClient({
      authToken,
      environmentId: 'e3ec714e-06f0-4760-99d3-84912024f306',
      baseApiUrl: BASE_API_URL,
      baseMPCRelayApiUrl: MPC_RELAY_URL,
    })
  }

  async init() {
    this.initialized = true
    await this.client.authenticateApiToken(this.authToken)
  }

  async createWallet(): Promise<Wallet> {
    if (!this.initialized) {
      throw new Error('Wallet not initialized')
    }

    const evmWallet = await this.client.createWalletAccount({
      thresholdSignatureScheme: 'TWO_OF_TWO',
      onError: (error: Error) => {
        console.error('EVM wallet creation error:', error)
      },
    })

    console.log('EVM wallet created:', evmWallet.accountAddress)

    const walletInstance = new Wallet(
      evmWallet.accountAddress,
      this.verbs,
      this,
    )
    walletInstance.init(getAddress(evmWallet.accountAddress))
    return walletInstance
  }

  /**
   * Get wallet associated with a given user id
   * @description Retrieves wallet information from Dynamic.xyz service
   * @param userId - User identifier
   * @returns Promise resolving to wallet or null if not found
   */
  async getWallet(_: string): Promise<Wallet> {
    // TODO: Figure out how to get wallet by user id
    return this.createWallet()
  }

  /**
   * Get all wallets via Dynamic.xyz
   * @description Retrieves all wallets from Dynamic.xyz service with optional filtering
   * @param options - Optional parameters for filtering and pagination
   * @returns Promise resolving to array of wallets
   */
  async getAllWallets(): Promise<Wallet[]> {
    // TODO: Figure out how to get all wallets
    return []
  }

  async sign(
    walletId: string,
    transactionData: TransactionData,
  ): Promise<Hash> {
    const wallet = await this.getWallet(walletId)

    const publicClient = this.verbs.chainManager.getPublicClient(130) // Unichain

    const tx = await publicClient.prepareTransactionRequest({
      ...transactionData,
      value: BigInt(transactionData.value),
      chain: publicClient.chain!,
      account: wallet.address,
    })

    const signedTx = await this.client.signTransaction({
      senderAddress: wallet.address,
      transaction: tx,
    })

    return signedTx
  }
}
