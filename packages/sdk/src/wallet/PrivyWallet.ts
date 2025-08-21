import { type Address, type Hash,type PublicClient,  type Hex, type Quantity, encodeFunctionData, encodeAbiParameters, http, createWalletClient } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'

import type { PrivyWalletProvider } from './providers/privy.js'
import { SupportedChainId } from '@/constants/supportedChains.js'
import { smartWalletAbi } from '@/abis/smartWallet.js'
import { unichain } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

/**
 * Privy wallet implementation
 * @description Wallet implementation using Privy service
 */
export class PrivyWallet {
  public address: Address
  public walletId: string
  private privyProvider: PrivyWalletProvider
  private chainManager: ChainManager
  /**
   * Create a new Privy wallet provider
   * @param appId - Privy application ID
   * @param appSecret - Privy application secret
   * @param verbs - Verbs instance for accessing configured providers
   */
  constructor(
    privyProvider: PrivyWalletProvider,
    chainManager: ChainManager,
    walletId: string,
    address: Address,
  ) {
    this.privyProvider = privyProvider
    this.chainManager = chainManager
    this.walletId = walletId
    this.address = address
  }

  /**
   * Send a signed transaction
   * @description Sends a pre-signed transaction to the network
   * @param signedTransaction - Signed transaction to send
   * @param publicClient - Viem public client to send the transaction
   * @returns Promise resolving to transaction hash
   */
    async send(
        signedTransaction: string,
        publicClient: PublicClient,
      ): Promise<Hash> {
        try {
          const hash = await publicClient.sendRawTransaction({
            serializedTransaction: signedTransaction as `0x${string}`,
          })
          return hash
        } catch (error) {
          throw new Error(
            `Failed to send transaction: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          )
        }
      }

  /**
   * Sign a transaction without sending it
   * @description Signs a transaction using Privy's wallet API but doesn't send it
   * @param walletId - Wallet ID to use for signing
   * @param transactionData - Transaction data to sign
   * @returns Promise resolving to signed transaction
   * @throws Error if transaction signing fails
   */
  async signOnly(txParams: {
    /** The address the transaction is sent from. Must be hexadecimal formatted. */
    from?: Hex
    /** Destination address of the transaction. */
    to?: Hex
    /** The nonce to be used for the transaction (hexadecimal or number). */
    nonce?: Quantity
    /** (optional) The chain ID of network your transaction will  be sent on. */
    chainId?: Quantity
    /** (optional) Data to send to the receiving address, especially when calling smart contracts. Must be hexadecimal formatted. */
    data?: Hex
    /** (optional) The value (in wei) be sent with the transaction (hexadecimal or number). */
    value?: Quantity
    /** (optional) The EIP-2718 transction type (e.g. `2` for EIP-1559 transactions). */
    type?: 0 | 1 | 2
    /** (optional) The max units of gas that can be used by this transaction (hexadecimal or number). */
    gasLimit?: Quantity
    /** (optional) The price (in wei) per unit of gas for this transaction (hexadecimal or number), for use in non EIP-1559 transactions (type 0 or 1). */
    gasPrice?: Quantity
    /** (optional) The maxFeePerGas (hexadecimal or number) to be used in this transaction, for use in EIP-1559 (type 2) transactions. */
    maxFeePerGas?: Quantity
    /** (optional) The maxPriorityFeePerGas (hexadecimal or number) to be used in this transaction, for use in EIP-1559 (type 2) transactions. */
    maxPriorityFeePerGas?: Quantity
  }): Promise<string> {
    try {
      console.log(
        `[PRIVY_PROVIDER] Complete tx params - Type: ${txParams.type}, Nonce: ${txParams.nonce}, Limit: ${txParams.gasLimit}, MaxFee: ${txParams.maxFeePerGas || 'fallback'}, Priority: ${txParams.maxPriorityFeePerGas || 'fallback'}`,
      )

      const response =
        await this.privyProvider.privy.walletApi.ethereum.signTransaction({
          walletId: this.walletId,
          transaction: txParams,
        })

      return response.signedTransaction
    } catch (error) {
      throw new Error(
        `Failed to sign transaction for wallet ${this.walletId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  async authorize7702(chainId: SupportedChainId, contract: Address) {
    const authorization = await this.privyProvider.privy.walletApi.ethereum.sign7702Authorization({
        walletId: this.walletId,
        contract,
        chainId,
    });
    console.log('Authorization signed: %s', authorization)
    
    const initializeData = encodeFunctionData({
        abi: smartWalletAbi,
        functionName: 'initialize',
        args: [[encodeAbiParameters([{ type: 'address' }], [this.address])]],
      })
      const publicClient = this.chainManager.getPublicClient(chainId);

      const nonce = await publicClient.getTransactionCount({
        address: this.address,
        blockTag: 'pending', // Use pending to get the next nonce including any pending txs
      })
      const walletClient = createWalletClient({
        chain: unichain,
        transport: http('http://127.0.0.1:9545'),
        account: privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'),
      })
      const hash = await walletClient.sendTransaction({
        // account: this.address,
        to: this.address,
        data: initializeData,
        authorizationList: [{...authorization, address: authorization.contract, chainId: Number(authorization.chainId), nonce: Number(authorization.nonce)}],
        value: 0n,
      })
    // const tx = {
    //     from: this.address,
    //     to:   this.address,
    //     data: initializeData,
    //     authorizationList: [authorization],
    //     chainId,
    //     nonce,
    //   };
    //   const response = await this.privyProvider.privy.walletApi.ethereum.signTransaction({
    //     walletId: this.walletId,
    //     transaction: tx,
    //   });
      console.log('delegated smart wallet hash', hash);
      // const hash = await this.send(response.signedTransaction, publicClient);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log('delegated smart wallet receipt', receipt);
      return hash;
  }
}
