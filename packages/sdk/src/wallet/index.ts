import { type Address, encodeFunctionData, erc20Abi, type Hash } from 'viem'
import { unichain } from 'viem/chains'

import { fetchBalance } from '@/services/tokenBalance.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import type {
  LendOptions,
  LendTransaction,
  TransactionData,
} from '@/types/lend.js'
import type { TokenBalance } from '@/types/token.js'
import type { VerbsInterface } from '@/types/verbs.js'
import type { Wallet as WalletInterface } from '@/types/wallet.js'
import {
  type AssetIdentifier,
  parseAssetAmount,
  parseLendParams,
  resolveAsset,
} from '@/utils/assets.js'

/**
 * Wallet implementation
 * @description Concrete implementation of the Wallet interface
 */
export class Wallet implements WalletInterface {
  id: string
  address!: Address
  private initialized: boolean = false
  private verbs: VerbsInterface
  private walletProvider: any // Store reference to wallet provider for signing

  /**
   * Create a new wallet instance
   * @param id - Unique wallet identifier
   * @param verbs - Verbs instance to access configured providers and chain manager
   */
  constructor(id: string, verbs: VerbsInterface, walletProvider?: any) {
    this.id = id
    this.verbs = verbs
    this.walletProvider = walletProvider
  }

  init(address: Address) {
    this.address = address
    this.initialized = true
  }

  /**
   * Get asset balances across all supported chains
   * @returns Promise resolving to array of asset balances
   */
  async getBalance(): Promise<TokenBalance[]> {
    if (!this.initialized) {
      throw new Error('Wallet not initialized')
    }

    const tokenBalancePromises = Object.values(SUPPORTED_TOKENS).map(
      async (token) => {
        // Access ChainManager through Verbs
        return fetchBalance(this.verbs.chainManager, this.address, token)
      },
    )

    return Promise.all(tokenBalancePromises)
  }

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
    console.log(
      `[SDK_WALLET] Starting lend: ${amount} ${asset} for wallet ${this.address}`,
    )

    if (!this.initialized) {
      console.log('[SDK_WALLET] Error: Wallet not initialized')
      throw new Error('Wallet not initialized')
    }

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

    // Delegate to the lend provider configured in Verbs
    // TODO: In a real implementation, this would:
    // 1. Check wallet balance for the asset
    // 2. Approve the lending protocol to spend the asset if needed
    // 3. Execute the lending transaction through the wallet's signing capabilities

    console.log('[SDK_WALLET] Calling verbs.lend.deposit')
    const result = await this.verbs.lend.deposit(
      resolvedAsset.address,
      parsedAmount,
      marketId,
      lendOptions,
    )

    console.log(`[SDK_WALLET] Lend completed successfully: ${result.hash}`)
    return result
  }

  /**
   * Sign and send a transaction
   * @description Signs and sends a transaction using the configured wallet provider
   * @param transactionData - Transaction data to sign and send
   * @returns Promise resolving to transaction hash
   * @throws Error if wallet is not initialized or no wallet provider is configured
   */
  async signAndSend(transactionData: TransactionData): Promise<Hash> {
    if (!this.initialized) {
      throw new Error('Wallet not initialized')
    }

    if (!this.walletProvider || !this.walletProvider.sign) {
      throw new Error('Wallet provider does not support transaction signing')
    }

    return this.walletProvider.sign(this.id, transactionData)
  }

  /**
   * Sign a transaction without sending it
   * @description Signs a transaction using the configured wallet provider but doesn't send it
   * @param transactionData - Transaction data to sign
   * @returns Promise resolving to signed transaction
   * @throws Error if wallet is not initialized or no wallet provider is configured
   */
  async sign(
    transactionData: TransactionData,
  ): Promise<`0x${string}`> {
    if (!this.initialized) {
      throw new Error('Wallet not initialized')
    }

    if (!this.walletProvider || !(this.walletProvider as any).signOnly) {
      throw new Error(
        'Wallet provider does not support transaction signing only',
      )
    }

    return (this.walletProvider as any).signOnly(
      this.id,
      transactionData,
    ) as `0x${string}`
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

  /**
   * Send tokens to another address
   * @description Sends ETH or ERC20 tokens to a recipient address
   * @param amount - Human-readable amount to send (e.g. 1.5)
   * @param asset - Asset symbol (e.g. 'usdc', 'eth') or token address
   * @param recipientAddress - Address to send to
   * @returns Promise resolving to transaction data
   * @throws Error if wallet is not initialized or asset is not supported
   */
  async sendTokens(
    amount: number,
    asset: AssetIdentifier,
    recipientAddress: Address,
  ): Promise<TransactionData> {
    if (!this.initialized) {
      throw new Error('Wallet not initialized')
    }

    if (!recipientAddress) {
      throw new Error('Recipient address is required')
    }

    // Validate amount
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0')
    }

    // TODO: Get actual chain ID from wallet context, for now using Unichain
    const chainId = unichain.id

    // Handle ETH transfers
    if (asset.toLowerCase() === 'eth') {
      const parsedAmount = parseAssetAmount(amount, 18) // ETH has 18 decimals

      return {
        to: recipientAddress,
        value: `0x${parsedAmount.toString(16)}`,
        data: '0x',
      }
    }

    // Handle ERC20 token transfers
    const resolvedAsset = resolveAsset(asset, chainId)
    const parsedAmount = parseAssetAmount(amount, resolvedAsset.decimals)

    // Encode ERC20 transfer function call
    const transferData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipientAddress, parsedAmount],
    })

    return {
      to: resolvedAsset.address,
      value: '0x0',
      data: transferData,
    }
  }
}
