import type { PrivyClient } from '@privy-io/server-auth'
import {
  createViemAccount,
  type GetViemAccountInputType,
} from '@privy-io/server-auth/viem'
import {
  type Address,
  createWalletClient,
  fallback,
  type Hash,
  http,
  type LocalAccount,
  type WalletClient,
} from 'viem'
import { unichain } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type {
  LendOptions,
  LendProvider,
  LendTransaction,
  TransactionData,
} from '@/types/lend.js'
import { type AssetIdentifier, parseLendParams } from '@/utils/assets.js'
import { EmbeddedWallet } from '@/wallet/base/EmbeddedWallet.js'

/**
 * Privy wallet implementation
 * @description Wallet implementation using Privy service
 */
export class PrivyWallet extends EmbeddedWallet {
  public walletId: string
  private privyClient: PrivyClient
  private chainManager: ChainManager
  private lendProvider: LendProvider
  /**
   * Create a new Privy wallet provider
   * @param appId - Privy application ID
   * @param appSecret - Privy application secret
   * @param verbs - Verbs instance for accessing configured providers
   */
  constructor(
    privyClient: PrivyClient,
    walletId: string,
    address: Address,
    chainManager: ChainManager,
    lendProvider: LendProvider,
  ) {
    super(address)
    this.privyClient = privyClient
    this.walletId = walletId
    this.chainManager = chainManager
    this.lendProvider = lendProvider
  }

  /**
   * Create a LocalAccount from this Privy wallet
   * @description Converts the Privy wallet into a viem-compatible LocalAccount that can sign
   * messages and transactions. The returned account uses Privy's signing infrastructure
   * under the hood while providing a standard viem interface.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   * @throws Error if wallet retrieval fails or signing operations are not supported
   */
  async account(): Promise<LocalAccount> {
    const account = await createViemAccount({
      walletId: this.walletId,
      address: this.address,
      // TODO: Fix this type error
      privy: this.privyClient as unknown as GetViemAccountInputType['privy'],
    })
    return account
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
    const account = await this.account()
    const rpcUrls = this.chainManager.getRpcUrls(chainId)
    return createWalletClient({
      account,
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
   * Lend assets to a lending market
   * @description Lends assets using the configured lending provider with human-readable amounts
   * @param amount - Human-readable amount to lend (e.g. 1.5)
   * @param asset - Asset symbol (e.g. 'usdc') or token address
   * @param marketId - Optional specific market ID or vault name
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   * @throws Error if no lending provider is configured
   */
  async lend(
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
  }

  /**
   * Sign a transaction without sending it
   * @description Signs a transaction using the configured wallet provider but doesn't send it
   * @param transactionData - Transaction data to sign
   * @returns Promise resolving to signed transaction
   * @throws Error if wallet is not initialized or no wallet provider is configured
   */
  async sign(transactionData: TransactionData): Promise<`0x${string}`> {
    return (await this.signOnly(transactionData)) as `0x${string}`
  }

  /**
   * Sign a transaction without sending it
   * @description Signs a transaction using Privy's wallet API but doesn't send it
   * @param walletId - Wallet ID to use for signing
   * @param transactionData - Transaction data to sign
   * @returns Promise resolving to signed transaction
   * @throws Error if transaction signing fails
   */
  async signOnly(transactionData: TransactionData): Promise<string> {
    try {
      const privyWallet = await this.privyClient.walletApi.getWallet({
        id: this.walletId,
      })
      // Get public client for gas estimation
      const publicClient = this.chainManager.getPublicClient(unichain.id) // Unichain

      // Estimate gas limit
      const gasLimit = await publicClient.estimateGas({
        account: privyWallet.address as Address,
        to: transactionData.to,
        data: transactionData.data as `0x${string}`,
        value: BigInt(transactionData.value),
      })

      // Get current gas price and fee data
      const feeData = await publicClient.estimateFeesPerGas()

      // Get current nonce for the wallet - manual management since Privy isn't handling it properly
      const nonce = await publicClient.getTransactionCount({
        address: privyWallet.address as Address,
        blockTag: 'pending', // Use pending to get the next nonce including any pending txs
      })

      // According to Privy docs: if you provide ANY gas parameters, you must provide ALL of them
      const txParams: any = {
        to: transactionData.to,
        data: transactionData.data as `0x${string}`,
        value: transactionData.value,
        chainId: 130, // Unichain
        type: 2, // EIP-1559
        gasLimit: `0x${gasLimit.toString(16)}`,
        maxFeePerGas: `0x${(feeData.maxFeePerGas || BigInt(1000000000)).toString(16)}`, // fallback to 1 gwei
        maxPriorityFeePerGas: `0x${(feeData.maxPriorityFeePerGas || BigInt(100000000)).toString(16)}`, // fallback to 0.1 gwei
        nonce: `0x${nonce.toString(16)}`, // Explicitly provide the correct nonce
      }

      console.log(
        `[PRIVY_PROVIDER] Complete tx params - Type: ${txParams.type}, Nonce: ${nonce}, Limit: ${gasLimit}, MaxFee: ${feeData.maxFeePerGas || 'fallback'}, Priority: ${feeData.maxPriorityFeePerGas || 'fallback'}`,
      )

      const response =
        await this.privyClient.walletApi.ethereum.signTransaction({
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

  /**
   * Send a signed transaction
   * @description Sends a pre-signed transaction to the network
   * @param signedTransaction - Signed transaction to send
   * @param publicClient - Viem public client to send the transaction
   * @returns Promise resolving to transaction hash
   */
  async send(signedTransaction: string, publicClient: any): Promise<Hash> {
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
}
