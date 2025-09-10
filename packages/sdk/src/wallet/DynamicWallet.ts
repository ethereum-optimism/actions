import type { WalletProperties } from '@dynamic-labs-wallet/node'
import type { DynamicEvmWalletClient } from '@dynamic-labs-wallet/node-evm'
import type { Address, Hex, LocalAccount, WalletClient } from 'viem'
import { toAccount } from 'viem/accounts'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { Wallet } from '@/wallet/base/Wallet.js'

/**
 * Privy wallet implementation
 * @description Wallet implementation using Privy service
 */
export class DynamicWallet extends Wallet {
  public signer!: LocalAccount
  public readonly address: Address
  private evmClient: DynamicEvmWalletClient
  private password?: string
  private keyShares?: WalletProperties['externalServerKeyShares']

  /**
   * Create a new Privy wallet provider
   * @param appId - Privy application ID
   * @param appSecret - Privy application secret
   * @param verbs - Verbs instance for accessing configured providers
   */
  public constructor(
    evmClient: DynamicEvmWalletClient,
    address: Address,
    chainManager: ChainManager,
    password?: string,
    keyShares?: WalletProperties['externalServerKeyShares'],
  ) {
    super(chainManager)
    this.evmClient = evmClient
    this.address = address
    this.password = password
    this.keyShares = keyShares
    this.signer = this.createAccount()
  }

  async walletClient(_chainId: SupportedChainId): Promise<WalletClient> {
    throw new Error('Not implemented')
  }

  /**
   * Create a LocalAccount from this Privy wallet
   * @description Converts the Privy wallet into a viem-compatible LocalAccount that can sign
   * messages and transactions. The returned account uses Privy's signing infrastructure
   * under the hood while providing a standard viem interface.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   * @throws Error if wallet retrieval fails or signing operations are not supported
   */
  private createAccount(): LocalAccount {
    const password = this.password
    const evmClient = this.evmClient
    const address = this.address
    const keyShares = this.keyShares

    return toAccount({
      address: this.address,

      async signMessage({ message }) {
        return evmClient.signMessage({
          message: message as Hex,
          accountAddress: address,
          password: password,
          externalServerKeyShares: keyShares,
        })
      },

      async signTransaction(transaction) {
        const hash = await evmClient.signTransaction({
          senderAddress: address,
          transaction: transaction,
          password: password,
          externalServerKeyShares: keyShares,
        })
        return hash as Hex
      },

      async signTypedData() {
        throw new Error('Not implemented')
      },

      async sign() {
        throw new Error('Not implemented')
      },

      async signAuthorization() {
        throw new Error('Not implemented')
      },
    })
  }
}
