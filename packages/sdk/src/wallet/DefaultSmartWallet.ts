import type { Address, Hash, LocalAccount } from 'viem'
import { encodeFunctionData, erc20Abi, pad } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'
import { toCoinbaseSmartAccount } from 'viem/account-abstraction'
import { unichain } from 'viem/chains'

import { smartWalletFactoryAbi } from '@/abis/smartWalletFactory.js'
import { smartWalletFactoryAddress } from '@/constants/addresses.js'
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
import { SmartWallet } from '@/wallet/base/SmartWallet.js'

/**
 * Smart Wallet Implementation
 * @description ERC-4337 compatible smart wallet that uses Coinbase Smart Account (https://github.com/coinbase/smart-wallet/blob/main/src/CoinbaseSmartWallet.sol).
 * Supports multi-owner wallets, gasless transactions via paymasters, and cross-chain operations.
 */
export class DefaultSmartWallet extends SmartWallet {
  /** Local account used for signing transactions and UserOperations */
  public readonly signer: LocalAccount
  /** Address of the smart wallet */
  private _address!: Address
  /** Array of wallet owners (Ethereum addresses or WebAuthn public keys) */
  private owners: Array<Address | WebAuthnAccount>
  /** Index of the signer in the owners array (defaults to 0 if not specified) */
  private signerOwnerIndex?: number
  /** Known deployment address of the wallet (if already deployed) */
  private deploymentAddress?: Address
  /** Provider for lending market operations */
  private lendProvider: LendProvider
  /** Manages supported blockchain networks and RPC clients */
  private chainManager: ChainManager
  /** Nonce used for deterministic address generation (defaults to 0) */
  private nonce?: bigint

  /**
   * Create a Smart Wallet instance
   * @param owners - Array of wallet owners (addresses or WebAuthn accounts)
   * @param signer - Local account for signing transactions
   * @param chainManager - Network management service
   * @param lendProvider - Lending operations provider
   * @param deploymentAddress - Known wallet address (if already deployed)
   * @param ownerIndex - Index of signer in owners array
   * @param nonce - Nonce for address generation
   */
  private constructor(
    owners: Array<Address | WebAuthnAccount>,
    signer: LocalAccount,
    chainManager: ChainManager,
    lendProvider: LendProvider,
    deploymentAddress?: Address,
    signerOwnerIndex?: number,
    nonce?: bigint,
  ) {
    super()
    this.owners = owners
    this.signer = signer
    this.signerOwnerIndex = signerOwnerIndex
    this.deploymentAddress = deploymentAddress
    this.chainManager = chainManager
    this.lendProvider = lendProvider
    this.nonce = nonce
  }

  get address() {
    if (!this._address) {
      throw new Error('Smart wallet not initialized')
    }
    return this._address
  }

  static async create(params: {
    owners: Array<Address | WebAuthnAccount>
    signer: LocalAccount
    chainManager: ChainManager
    lendProvider: LendProvider
    deploymentAddress?: Address
    signerOwnerIndex?: number
    nonce?: bigint
  }): Promise<DefaultSmartWallet> {
    const wallet = new DefaultSmartWallet(
      params.owners,
      params.signer,
      params.chainManager,
      params.lendProvider,
      params.deploymentAddress,
      params.signerOwnerIndex,
      params.nonce,
    )
    await wallet.initialize()
    return wallet
  }

  /**
   * Create a Coinbase Smart Account instance
   * @description Converts this wallet into a viem-compatible smart account for ERC-4337 operations.
   * @param chainId - Target blockchain network ID
   * @returns Coinbase Smart Account instance configured for the specified chain
   */
  async getCoinbaseSmartAccount(
    chainId: SupportedChainId,
  ): ReturnType<typeof toCoinbaseSmartAccount> {
    return toCoinbaseSmartAccount({
      address: this.deploymentAddress,
      ownerIndex: this.signerOwnerIndex,
      client: this.chainManager.getPublicClient(chainId),
      owners: [this.signer],
      nonce: this.nonce,
      version: '1.1',
    })
  }

  /**
   * Get asset balances across all supported chains
   * @description Fetches ETH and ERC20 token balances for this wallet across all supported networks.
   * @returns Promise resolving to array of token balances with chain breakdown
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
    chainId: SupportedChainId,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    // Parse human-readable inputs
    const { amount: parsedAmount, asset: resolvedAsset } = parseLendParams(
      amount,
      asset,
      chainId,
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
   * Send a batch of transactions using this smart wallet
   * @description Executes a batch of transactions through the smart wallet, handling gas sponsorship
   * and ERC-4337 UserOperation creation automatically.
   * @param transactionData - The transaction data to execute
   * @param chainId - Target blockchain chain ID
   * @returns Promise resolving to the transaction hash
   */
  async sendBatch(
    transactionData: TransactionData[],
    chainId: SupportedChainId,
  ): Promise<Hash> {
    const account = await this.getCoinbaseSmartAccount(chainId)
    const bundlerClient = this.chainManager.getBundlerClient(chainId, account)
    try {
      const calls = transactionData
      const hash = await bundlerClient.sendUserOperation({
        account,
        calls,
        paymaster: true,
      })
      await bundlerClient.waitForUserOperationReceipt({
        hash,
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
   * Send a transaction via ERC-4337
   * @description Executes a transaction using the smart wallet with automatic gas sponsorship.
   * The transaction is sent as a UserOperation through the bundler service.
   * @param transactionData - Transaction details (to, value, data)
   * @param chainId - Target blockchain network ID
   * @returns Promise resolving to UserOperation hash
   * @throws Error if transaction fails or validation errors occur
   */
  async send(
    transactionData: TransactionData,
    chainId: SupportedChainId,
  ): Promise<Hash> {
    try {
      const account = await this.getCoinbaseSmartAccount(chainId)
      const bundlerClient = this.chainManager.getBundlerClient(chainId, account)
      const calls = [transactionData]
      const hash = await bundlerClient.sendUserOperation({
        account,
        calls,
        paymaster: true,
      })
      await bundlerClient.waitForUserOperationReceipt({
        hash,
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
        value: parsedAmount,
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
      value: 0n,
      data: transferData,
    }
  }

  protected async performInitialization() {
    this._address = await this.getAddress()
  }

  /**
   * Get the smart wallet address
   * @description Returns the deployment address if known, otherwise calculates the deterministic
   * address using CREATE2 based on owners and nonce.
   * @returns Promise resolving to the wallet address
   */
  private async getAddress() {
    if (this.deploymentAddress) return this.deploymentAddress

    const owners_bytes = this.owners.map((owner) => {
      if (typeof owner === 'string') return pad(owner)
      if (owner.type === 'webAuthn') return owner.publicKey
      throw new Error('invalid owner type')
    })

    // Factory is the same across all chains, so we can use the first chain to get the wallet address
    const publicClient = this.chainManager.getPublicClient(
      this.chainManager.getSupportedChains()[0],
    )
    const smartWalletAddress = await publicClient.readContract({
      abi: smartWalletFactoryAbi,
      address: smartWalletFactoryAddress,
      functionName: 'getAddress',
      args: [owners_bytes, this.nonce || 0n],
    })
    return smartWalletAddress
  }
}
