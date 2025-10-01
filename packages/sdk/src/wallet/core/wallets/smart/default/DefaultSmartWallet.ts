import type { Address, Hex, LocalAccount } from 'viem'
import {
  concatHex,
  decodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  isHex,
  size,
} from 'viem'
import type { WaitForUserOperationReceiptReturnType } from 'viem/account-abstraction'
import { toCoinbaseSmartAccount } from 'viem/account-abstraction'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { TransactionConfirmedButRevertedError } from '@/core/error/errors.js'
import { retryOnStaleRead } from '@/core/utils/retryOnStaleRead.js'
import { WalletLendNamespace } from '@/lend/namespaces/WalletLendNamespace.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type { LendConfig, LendProvider, TransactionData } from '@/types/lend.js'
import { parseAssetAmount } from '@/utils/assets.js'
import { SmartWallet } from '@/wallet/core/wallets/smart/abstract/SmartWallet.js'
import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'
import {
  smartWalletAbi,
  smartWalletFactoryAbi,
  smartWalletFactoryAddress,
} from '@/wallet/core/wallets/smart/default/constants/index.js'
import { findOwnerIndex } from '@/wallet/core/wallets/smart/default/utils/findOwnerIndex.js'
import { formatPublicKey } from '@/wallet/core/wallets/smart/default/utils/formatPublicKey.js'

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
  private owners: Signer[]
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
    owners: Signer[],
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
    owners: Signer[]
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
  ): Promise<WaitForUserOperationReceiptReturnType> {
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
      const userOperationReceipt =
        await bundlerClient.waitForUserOperationReceipt({
          hash,
        })

      return userOperationReceipt
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
  ): Promise<WaitForUserOperationReceiptReturnType> {
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
      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash,
      })

      return receipt
    } catch (error) {
      throw new Error(
        `Failed to send transaction: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Add a new signer to the smart wallet
   * @description Adds either an EOA address signer or a WebAuthn account signer
   * to the underlying smart wallet contract. For WebAuthn accounts, the method
   * extracts the x and y coordinates from the provided 64-byte public key and
   * calls the contract's `addOwnerPublicKey`. For EOA addresses it calls
   * `addOwnerAddress`. The add operation is sent as a UserOperation via
   * {@link sendBatch}, and upon success the method queries the contract to
   * resolve the signer's index.
   * @param signer - Ethereum address (EOA) or a `WebAuthnAccount` to add
   * @param chainId - Target chain on which the smart wallet operates
   * @returns Promise resolving to the onchain signer index for the newly added signer
   * @throws Error if the add operation fails or the owner index cannot be found
   */
  async addSigner(signer: Signer, chainId: SupportedChainId): Promise<number> {
    const calls = []
    if (typeof signer === 'string') {
      calls.push({
        to: this.address,
        data: encodeFunctionData({
          abi: smartWalletAbi,
          functionName: 'addOwnerAddress',
          args: [signer] as const,
        }),
        value: 0n,
      })
    } else if (signer.type === 'webAuthn') {
      const [x, y] = decodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'bytes32' }],
        signer.publicKey,
      )
      calls.push({
        to: this.address,
        data: encodeFunctionData({
          abi: smartWalletAbi,
          functionName: 'addOwnerPublicKey',
          args: [x, y] as const,
        }),
        value: 0n,
      })
    }

    const { success, receipt } = await this.sendBatch(calls, chainId)

    if (!success) {
      throw new TransactionConfirmedButRevertedError(
        'add signer call failed',
        receipt,
      )
    }

    const signerIndex = await retryOnStaleRead(
      () =>
        findOwnerIndex({
          address: this.address,
          signer,
          client: this.chainManager.getPublicClient(chainId),
        }),
      (index) => index === -1,
      { retries: 1, delayMs: 2000 },
    )

    if (signerIndex === -1) {
      throw new Error('failed to find signer index')
    }

    return signerIndex
  }

  /**
   * Remove an existing signer from the smart wallet
   * @description Removes a signer (EOA address or WebAuthn public key) from the
   * smart wallet contract. If `signerIndex` is not provided, the method resolves
   * it via {@link findSignerIndex}. The removal is executed via {@link sendBatch}
   * by calling the contract function `removeOwnerAtIndex(index, signerBytes)`.
   * Returns the ERC-4337 UserOperation receipt on success.
   * @param signer - Signer to remove: EOA address or `WebAuthnAccount`
   * @param chainId - Target chain on which the smart wallet operates
   * @param signerIndex - Optional known on-chain index of the signer (skips lookup when provided)
   * @returns Promise resolving to the UserOperation receipt for the removal
   * @throws Error if the signer index cannot be found or the removal operation fails
   */
  async removeSigner(
    signer: Signer,
    chainId: SupportedChainId,
    signerIndex?: number,
  ): Promise<WaitForUserOperationReceiptReturnType> {
    const resolvedSignerIndex =
      signerIndex ?? (await this.findSignerIndex(signer, chainId))
    if (resolvedSignerIndex === -1) {
      throw new Error('failed to find signer index')
    }
    const signerBytes = formatPublicKey(signer)
    const calls = [
      {
        to: this.address,
        data: encodeFunctionData({
          abi: smartWalletAbi,
          functionName: 'removeOwnerAtIndex',
          args: [BigInt(resolvedSignerIndex), signerBytes] as const,
        }),
        value: 0n,
      },
    ]
    const userOperationReceipt = await this.sendBatch(calls, chainId)

    if (!userOperationReceipt.success) {
      throw new TransactionConfirmedButRevertedError(
        'remove signer call failed',
        userOperationReceipt.receipt,
      )
    }

    return userOperationReceipt
  }

  /**
   * Find the index of a signer in the smart wallet
   * @param signer - Ethereum address (EOA) or a `WebAuthnAccount` to find
   * @param chainId - Target chain on which the smart wallet operates
   * @returns Promise resolving to the onchain signer index for the found signer
   * returns -1 if the signer is not found
   */
  async findSignerIndex(
    signer: Signer,
    chainId: SupportedChainId,
  ): Promise<number> {
    return findOwnerIndex({
      address: this.address,
      signer,
      client: this.chainManager.getPublicClient(chainId),
    })
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
      this.lend = new WalletLendNamespace(this.lendProvider, this)
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

    const owners_bytes = this.owners.map((owner) => formatPublicKey(owner))

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
