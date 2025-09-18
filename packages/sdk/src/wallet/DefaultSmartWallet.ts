import type { Address, Hash, Hex, LocalAccount } from 'viem'
import { concatHex, encodeFunctionData, erc20Abi, isHex, pad, size } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'
import { toCoinbaseSmartAccount } from 'viem/account-abstraction'

import { smartWalletFactoryAbi } from '@/abis/smartWalletFactory.js'
import { smartWalletFactoryAddress } from '@/constants/addresses.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { WalletLendNamespace } from '@/lend/namespaces/WalletLendNamespace.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type {
  LendConfig,
  LendOptions,
  LendProvider,
  LendTransaction,
  TransactionData,
} from '@/types/lend.js'
import { parseAssetAmount } from '@/utils/assets.js'
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
  private lendProvider?: LendProvider<LendConfig>
  /** Nonce used for deterministic address generation (defaults to 0) */
  private nonce?: bigint
  /** Optional 16-byte attribution suffix appended to callData */
  private attributionSuffix?: Hex

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
    lendProvider?: LendProvider<LendConfig>,
    deploymentAddress?: Address,
    signerOwnerIndex?: number,
    nonce?: bigint,
    attributionSuffix?: Hex,
  ) {
    super(chainManager)
    this.owners = owners
    this.signer = signer
    this.signerOwnerIndex = signerOwnerIndex
    this.deploymentAddress = deploymentAddress
    this.lendProvider = lendProvider
    this.nonce = nonce
    if (attributionSuffix) {
      DefaultSmartWallet.isValidAttributionSuffix(attributionSuffix)
      this.attributionSuffix = attributionSuffix
    }
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
    lendProvider?: LendProvider<LendConfig>
    deploymentAddress?: Address
    signerOwnerIndex?: number
    nonce?: bigint
    attributionSuffix?: Hex
  }): Promise<DefaultSmartWallet> {
    const wallet = new DefaultSmartWallet(
      params.owners,
      params.signer,
      params.chainManager,
      params.lendProvider,
      params.deploymentAddress,
      params.signerOwnerIndex,
      params.nonce,
      params.attributionSuffix,
    )
    await wallet.initialize()
    return wallet
  }

  /**
   * Checks if a 16-byte attribution suffix is valid
   * @description Checks if the suffix is a valid hex string and is exactly 16 bytes
   * @throws Error if suffix is not hex or is not exactly 16 bytes
   */
  private static isValidAttributionSuffix(suffix: Hex): void {
    if (suffix == null) {
      return
    }
    if (!isHex(suffix)) {
      throw new Error('Attribution suffix must be a valid hex string')
    }
    if (size(suffix) !== 16) {
      throw new Error('Attribution suffix must be 16 bytes (0x + 32 hex chars)')
    }
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
   * Lend assets to a lending market
   * this will be replaced with lend.execute()
   * @description Lends assets using the configured lending provider with human-readable amounts
   * @param amount - Human-readable amount to lend (e.g. 1.5)
   * @param asset - Asset symbol (e.g. 'usdc') or token address
   * @param chainId - Target blockchain chain ID
   * @param marketId - Optional specific market ID or vault name
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   * @throws Error if no lending provider is configured
   * @todo Replace this with lend.execute()
   */
  async lendExecute(
    amount: number,
    asset: Asset,
    chainId: SupportedChainId,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    // Validate amount
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0')
    }

    // Check if asset is supported on the chain
    const tokenAddress = asset.address[chainId]
    if (!tokenAddress) {
      throw new Error(
        `${asset.metadata.symbol} not supported on chain ${chainId}`,
      )
    }

    // Parse human-readable amount
    const parsedAmount = parseAssetAmount(amount, asset.metadata.decimals)

    // Set receiver to wallet address if not specified
    const lendOptions: LendOptions = {
      ...options,
      receiver: options?.receiver || this.address,
    }

    if (!this.lendProvider) {
      throw new Error('Lending provider not configured')
    }

    const result = await this.lendProvider.deposit(
      tokenAddress,
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
      const uo = await bundlerClient.prepareUserOperation({
        account,
        calls: transactionData,
        paymaster: true,
      })
      const hash = await bundlerClient.sendUserOperation({
        account,
        callData: this.appendAttributionSuffix(uo.callData),
        initCode: uo.initCode
          ? this.appendAttributionSuffix(uo.initCode)
          : uo.initCode,
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
      const uo = await bundlerClient.prepareUserOperation({
        account,
        calls: [transactionData],
        paymaster: true,
      })

      const hash = await bundlerClient.sendUserOperation({
        account,
        callData: this.appendAttributionSuffix(uo.callData),
        initCode: uo.initCode
          ? this.appendAttributionSuffix(uo.initCode)
          : uo.initCode,
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
   * @param asset - Asset object with address mapping and metadata
   * @param chainId - Chain ID for the transaction
   * @param recipientAddress - Address to send to
   * @returns Promise resolving to transaction data
   * @throws Error if wallet is not initialized or asset is not supported
   */
  async sendTokens(
    amount: number,
    asset: Asset,
    chainId: SupportedChainId,
    recipientAddress: Address,
  ): Promise<TransactionData> {
    if (!recipientAddress) {
      throw new Error('Recipient address is required')
    }

    // Validate amount
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0')
    }

    // Get token address for the specified chain
    const tokenAddress = asset.address[chainId]
    if (!tokenAddress) {
      throw new Error(
        `${asset.metadata.symbol} not supported on chain ${chainId}`,
      )
    }

    // Handle ETH transfers
    if (asset.type === 'native') {
      const parsedAmount = parseAssetAmount(amount, asset.metadata.decimals)

      return {
        to: recipientAddress,
        value: parsedAmount,
        data: '0x',
      }
    }

    // Handle ERC20 token transfers
    const parsedAmount = parseAssetAmount(amount, asset.metadata.decimals)

    // Encode ERC20 transfer function call
    const transferData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipientAddress, parsedAmount],
    })

    return {
      to: tokenAddress as Address,
      value: 0n,
      data: transferData,
    }
  }

  protected async performInitialization() {
    this._address = await this.getAddress()

    // Create wallet lend namespace after address is initialized if lend provider is available
    if (this.lendProvider) {
      this.lend = new WalletLendNamespace(this.lendProvider, this._address)
    }
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

  /**
   * Appends the attribution suffix to the bytes
   * @param bytes
   * @returns The bytes with the attribution suffix appended
   */
  private appendAttributionSuffix(bytes: Hex) {
    return bytes && bytes !== '0x' && this.attributionSuffix
      ? concatHex([bytes, this.attributionSuffix])
      : bytes
  }
}
