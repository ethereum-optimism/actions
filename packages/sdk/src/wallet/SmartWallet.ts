import type { PrivyClient } from '@privy-io/server-auth'
import type { Address, Hash, LocalAccount } from 'viem'
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  pad,
} from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'
import {
  createBundlerClient,
  toCoinbaseSmartAccount,
} from 'viem/account-abstraction'
import { toAccount } from 'viem/accounts'
import { baseSepolia, unichain } from 'viem/chains'

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

/**
 * Wallet implementation
 * @description Concrete implementation of the Wallet interface
 */
export class SmartWallet {
  public owners: Array<Address | WebAuthnAccount>
  public ownerIndex?: number
  public deploymentAddress?: Address
  private lendProvider: LendProvider
  private chainManager: ChainManager
  private bundlerUrl: string
  private nonce?: bigint

  /**
   * Create a new wallet instance
   * @param id - Unique wallet identifier
   * @param verbs - Verbs instance to access configured providers and chain manager
   */
  constructor(
    owners: Array<Address | WebAuthnAccount>,
    chainManager: ChainManager,
    lendProvider: LendProvider,
    bundlerUrl: string,
    deploymentAddress?: Address,
    ownerIndex?: number,
    nonce?: bigint,
  ) {
    this.owners = owners
    this.ownerIndex = ownerIndex
    this.deploymentAddress = deploymentAddress
    this.chainManager = chainManager
    this.lendProvider = lendProvider
    this.bundlerUrl = bundlerUrl
    this.nonce = nonce
  }

  async getAddress() {
    if (this.deploymentAddress) return this.deploymentAddress

    const owners_bytes = this.owners.map((owner) => {
      if (typeof owner === 'string') return pad(owner)
      if (owner.type === 'webAuthn') return owner.publicKey
      throw new Error('invalid owner type')
    })

    // Factory is the same accross all chains, so we can use the first chain to get the wallet address
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

  async getCoinbaseSmartAccount(
    chainId: SupportedChainId,
    privyAccount: LocalAccount,
  ): Promise<ReturnType<typeof toCoinbaseSmartAccount>> {
    return toCoinbaseSmartAccount({
      address: this.deploymentAddress,
      ownerIndex: this.ownerIndex,
      client: this.chainManager.getPublicClient(chainId),
      owners: [privyAccount],
      nonce: this.nonce,
      version: '1.1',
    })
  }

  /**
   * Get asset balances across all supported chains
   * @returns Promise resolving to array of asset balances
   */
  async getBalance(): Promise<TokenBalance[]> {
    const address = await this.getAddress()
    const tokenBalancePromises = Object.values(SUPPORTED_TOKENS).map(
      async (token) => {
        return fetchERC20Balance(this.chainManager, address, token)
      },
    )
    const ethBalancePromise = fetchETHBalance(this.chainManager, address)

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
    // TODO: Get actual chain ID from wallet context, for now using Unichain
    const { amount: parsedAmount, asset: resolvedAsset } = parseLendParams(
      amount,
      asset,
      chainId,
    )
    const address = await this.getAddress()

    // Set receiver to wallet address if not specified
    const lendOptions: LendOptions = {
      ...options,
      receiver: options?.receiver || address,
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
   * Send a signed transaction
   * @description Sends a pre-signed transaction to the network
   * @param signedTransaction - Signed transaction to send
   * @param publicClient - Viem public client to send the transaction
   * @returns Promise resolving to transaction hash
   */
  async send(
    transactionData: TransactionData,
    chainId: SupportedChainId,
    privyClient: PrivyClient,
    privyWalletId: string,
  ): Promise<Hash> {
    try {
      const privyWallet = await privyClient.walletApi.getWallet({
        id: privyWalletId,
      })
      const signerAddress = privyWallet.address
      const privyAccount = toAccount({
        address: signerAddress as Address,
        async signMessage({ message }) {
          const signed = await privyClient.walletApi.ethereum.signMessage({
            walletId: privyWalletId,
            message: message.toString(),
          })
          return signed.signature as Hash
        },
        async sign(parameters) {
          const signed = await privyClient.walletApi.ethereum.secp256k1Sign({
            walletId: privyWalletId,
            hash: parameters.hash,
          })
          return signed.signature as Hash
        },
        async signTransaction() {
          // Implement if needed
          throw new Error('Not implemented')
        },
        async signTypedData() {
          // Implement if needed
          throw new Error('Not implemented')
        },
      })
      const account = await this.getCoinbaseSmartAccount(chainId, privyAccount)
      const client = createPublicClient({
        chain: baseSepolia,
        transport: http(this.bundlerUrl),
      })
      const bundlerClient = createBundlerClient({
        account,
        client,
        transport: http(this.bundlerUrl),
        chain: baseSepolia,
      })
      // Pads the preVerificationGas (or any other gas limits you might want) to ensure your UserOperation lands onchain
      account.userOperation = {
        estimateGas: async (userOperation) => {
          try {
            const estimate = await bundlerClient.estimateUserOperationGas(
              userOperation as any,
            )
            console.log('estimate succeeded', estimate)
            // adjust preVerification upward
            estimate.preVerificationGas = estimate.preVerificationGas * 2n
            // return estimate;
            return {
              ...estimate,
              preVerificationGas: estimate.preVerificationGas * 2n,
              verificationGasLimit: estimate.verificationGasLimit * 2n, // Most important for AA23
              callGasLimit: estimate.callGasLimit * 2n,
            }
          } catch (error) {
            console.error('Failed to estimate gas:', error)
            return {
              preVerificationGas: 200000n,
              verificationGasLimit: 800000n, // High limit for complex validation
              callGasLimit: 200000n,
            }
          }
        },
      }
      const calls = [transactionData]
      const hash = await bundlerClient.sendUserOperation({
        account,
        calls,
        paymaster: true,
      })
      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash,
      })

      console.log('✅ Transaction successfully sponsored!')
      console.log(
        `⛽ View sponsored UserOperation on blockscout: https://base-sepolia.blockscout.com/op/${receipt.userOpHash}`,
      )
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
}
