import type { Address, Hash, Hex, PublicClient, Quantity } from 'viem'
import { encodeFunctionData, erc20Abi } from 'viem'
import { unichain } from 'viem/chains'

import { smartWalletAbi } from '@/abis/smartWallet.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { fetchERC20Balance, fetchETHBalance } from '@/services/tokenBalance.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import type {
  LendOptions,
  LendProvider,
  LendTransaction,
  TransactionData,
} from '@/types/lend.js'
import type { TokenBalance } from '@/types/token.js'
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
export class SmartWallet {
  public ownerAddresses: Address[]
  public address: Address
  private lendProvider: LendProvider
  private chainManager: ChainManager

  /**
   * Create a new wallet instance
   * @param id - Unique wallet identifier
   * @param verbs - Verbs instance to access configured providers and chain manager
   */
  constructor(
    address: Address,
    ownerAddresses: Address[],
    chainManager: ChainManager,
    lendProvider: LendProvider,
  ) {
    this.address = address
    this.ownerAddresses = ownerAddresses
    this.chainManager = chainManager
    this.lendProvider = lendProvider
  }

  /**
   * Get asset balances across all supported chains
   * @returns Promise resolving to array of asset balances
   */
  async getBalance(): Promise<TokenBalance[]> {
    const tokenBalancePromises = Object.values(SUPPORTED_TOKENS).map(
      async (token) => {
        return fetchERC20Balance(this.chainManager, this.address, token)
      },
    )
    const ethBalancePromise = fetchETHBalance(this.chainManager, this.address)

    return Promise.all([ethBalancePromise, ...tokenBalancePromises])
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

  execute(transactionData: TransactionData): Hash {
    return encodeFunctionData({
      abi: smartWalletAbi,
      functionName: 'execute',
      args: [transactionData.to, transactionData.value, transactionData.data],
    })
  }

  async getTxParams(
    transactionData: TransactionData,
    chainId: SupportedChainId,
    ownerIndex: number = 0,
  ): Promise<{
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
  }> {
    const executeCallData = this.execute(transactionData)

    const publicClient = this.chainManager.getPublicClient(chainId)

    // Estimate gas limit
    const gasLimit = await publicClient.estimateGas({
      account: this.ownerAddresses[ownerIndex],
      to: this.address,
      data: executeCallData,
      value: BigInt(transactionData.value),
    })

    // Get current gas price and fee data
    const feeData = await publicClient.estimateFeesPerGas()

    // Get current nonce for the wallet - manual management since Privy isn't handling it properly
    const nonce = await publicClient.getTransactionCount({
      address: this.ownerAddresses[ownerIndex],
      blockTag: 'pending', // Use pending to get the next nonce including any pending txs
    })

    return {
      to: this.address,
      data: executeCallData,
      value: transactionData.value as `0x${string}`,
      chainId: `0x${chainId.toString(16)}`,
      type: 2, // EIP-1559
      gasLimit: `0x${gasLimit.toString(16)}`,
      maxFeePerGas: `0x${(feeData.maxFeePerGas || BigInt(1000000000)).toString(16)}`, // fallback to 1 gwei
      maxPriorityFeePerGas: `0x${(feeData.maxPriorityFeePerGas || BigInt(100000000)).toString(16)}`, // fallback to 0.1 gwei
      nonce: `0x${nonce.toString(16)}`, // Explicitly provide the correct nonce
    }
  }

  async estimateGas(
    transactionData: TransactionData,
    chainId: SupportedChainId,
    ownerIndex: number = 0,
  ): Promise<bigint> {
    const executeCallData = this.execute(transactionData)
    const publicClient = this.chainManager.getPublicClient(chainId)
    return publicClient.estimateGas({
      account: this.ownerAddresses[ownerIndex],
      to: this.address,
      data: executeCallData,
      value: BigInt(transactionData.value),
    })
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
