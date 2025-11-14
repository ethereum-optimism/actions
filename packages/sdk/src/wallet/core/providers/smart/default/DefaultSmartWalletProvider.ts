import type { Address, Hex, LocalAccount } from 'viem'
import { keccak256, slice, toHex } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { LendProvider } from '@/lend/core/LendProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
import { SmartWalletProvider } from '@/wallet/core/providers/smart/abstract/SmartWalletProvider.js'
import type { SmartWalletCreationResult } from '@/wallet/core/providers/smart/abstract/types/index.js'
import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'
import {
  smartWalletFactoryAbi,
  smartWalletFactoryAddress,
} from '@/wallet/core/wallets/smart/default/constants/index.js'
import { DefaultSmartWallet } from '@/wallet/core/wallets/smart/default/DefaultSmartWallet.js'
import { formatPublicKey } from '@/wallet/core/wallets/smart/default/utils/formatPublicKey.js'
import { getSignerPublicKey } from '@/wallet/core/wallets/smart/default/utils/getSignerPublicKey.js'
import { SmartWalletDeploymentError } from '@/wallet/core/wallets/smart/error/errors.js'

/**
 * Smart Wallet Provider
 * @description Factory for creating and managing Smart Wallet instances.
 * Handles wallet address prediction, creation, and retrieval using ERC-4337 account abstraction.
 */
export class DefaultSmartWalletProvider extends SmartWalletProvider {
  /** Manages supported blockchain networks */
  private chainManager: ChainManager
  /** Providers for lending market operations */
  private lendProviders: {
    morpho?: LendProvider<LendProviderConfig>
    aave?: LendProvider<LendProviderConfig>
  }
  /** Optional 16-byte attribution suffix appended to callData */
  private attributionSuffix?: Hex

  /**
   * Initialize the Smart Wallet Provider
   * @param chainManager - Manages supported blockchain networks
   * @param lendProviders - Providers for lending market operations
   * @param attributionSuffix - Optional attribution suffix
   */
  constructor(
    chainManager: ChainManager,
    lendProviders?: {
      morpho?: LendProvider<LendProviderConfig>
      aave?: LendProvider<LendProviderConfig>
    },
    attributionSuffix?: string,
  ) {
    super()
    this.chainManager = chainManager
    this.lendProviders = lendProviders || {}
    if (attributionSuffix) {
      this.attributionSuffix =
        DefaultSmartWalletProvider.computeAttributionSuffix(attributionSuffix)
    }
  }

  static computeAttributionSuffix(attributionSuffix: string) {
    return slice(keccak256(toHex(attributionSuffix)), 0, 16)
  }

  /**
   * Create a new smart wallet instance
   * @description Creates a new smart wallet and attempts to deploy it across all supported chains.
   * The wallet address is deterministically calculated from owners and nonce. Deployment failures
   * on individual chains do not prevent wallet creation - they are reported in the result.
   * @param owners - Array of wallet owners (addresses or WebAuthn public keys)
   * @param signer - Local account used for signing transactions
   * @param nonce - Optional nonce for address generation (defaults to 0)
   * @param deploymentChainIds - Optional chain IDs to deploy the wallet to.
   * If not provided, the wallet will be deployed to all supported chains. If you would
   * like to lazily deploy the wallet on first transaction, you can provide an empty array.
   * @returns Promise resolving to deployment result containing:
   * - `wallet`: The created SmartWallet instance
   * - `deployments`: Array of deployment results with chainId, receipt, success flag, and error
   */
  async createWallet(params: {
    signer: LocalAccount
    signers?: Signer[]
    nonce?: bigint
    deploymentChainIds?: SupportedChainId[]
  }): Promise<SmartWalletCreationResult<DefaultSmartWallet>> {
    const { signers, signer, nonce, deploymentChainIds } = params
    const wallet = await DefaultSmartWallet.create({
      signers,
      signer,
      chainManager: this.chainManager,
      lendProviders: this.lendProviders,
      nonce,
      attributionSuffix: this.attributionSuffix,
    })

    const deploymentResults = await Promise.allSettled(
      (deploymentChainIds ?? this.chainManager.getSupportedChains()).map(
        (chainId) => wallet.deploy(chainId),
      ),
    )
    const deploymentSuccesses = deploymentResults
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<
          Awaited<ReturnType<typeof wallet.deploy>>
        > => r.status === 'fulfilled',
      )
      .map((r) => {
        return {
          chainId: r.value.chainId,
          receipt: r.value.receipt,
          success: r.value.success,
        }
      })

    const deploymentFailures = deploymentResults
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => {
        if (r.reason instanceof SmartWalletDeploymentError) {
          return { error: r.reason, chainId: r.reason.chainId, success: false }
        }
        throw new Error(`Unknown error: ${r.reason}`)
      })

    return {
      wallet,
      deployments: [...deploymentSuccesses, ...deploymentFailures],
    }
  }

  /**
   * Get the predicted smart wallet address
   * @description Calculates the deterministic address where a smart wallet would be deployed
   * given the specified owners and nonce. Uses CREATE2 for address prediction.
   * @param params.owners - Array of wallet owners (addresses or WebAuthn public keys)
   * @param params.nonce - Nonce for address generation (defaults to 0)
   * @returns Promise resolving to the predicted wallet address
   */
  async getWalletAddress(params: { signers: Signer[]; nonce?: bigint }) {
    const { signers, nonce = 0n } = params
    const signerBytes = signers.map((signer) => {
      const publicKey = getSignerPublicKey(signer)
      return formatPublicKey(publicKey)
    })

    // Factory is the same accross all chains, so we can use the first chain to get the wallet address
    const publicClient = this.chainManager.getPublicClient(
      this.chainManager.getSupportedChains()[0],
    )
    const smartWalletAddress = await publicClient.readContract({
      abi: smartWalletFactoryAbi,
      address: smartWalletFactoryAddress,
      functionName: 'getAddress',
      args: [signerBytes, nonce],
    })
    return smartWalletAddress
  }

  /**
   * Get an existing smart wallet instance
   * @description Creates a SmartWallet instance for an already deployed wallet.
   * Use this when you know the wallet address and want to interact with it.
   * @param params.walletAddress - Address of the deployed smart wallet
   * @param params.signer - Local account used for signing transactions
   * @param params.ownerIndex - Index of the signer in the wallet's owner list (defaults to 0)
   * @returns SmartWallet instance
   */
  async getWallet(params: {
    walletAddress: Address
    signer: LocalAccount
    signers?: Signer[]
  }): Promise<DefaultSmartWallet> {
    const { walletAddress, signer, signers } = params
    return DefaultSmartWallet.create({
      signers,
      signer,
      chainManager: this.chainManager,
      lendProviders: this.lendProviders,
      deploymentAddress: walletAddress,
      attributionSuffix: this.attributionSuffix,
    })
  }
}
