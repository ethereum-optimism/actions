import type { Address, Hex, LocalAccount } from 'viem'
import { keccak256, pad, slice, toHex } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { LendConfig, LendProvider } from '@/types/lend/index.js'
import { SmartWalletProvider } from '@/wallet/core/providers/smart/abstract/SmartWalletProvider.js'
import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'
import {
  smartWalletFactoryAbi,
  smartWalletFactoryAddress,
} from '@/wallet/core/wallets/smart/default/constants/index.js'
import { DefaultSmartWallet } from '@/wallet/core/wallets/smart/default/DefaultSmartWallet.js'

/**
 * Smart Wallet Provider
 * @description Factory for creating and managing Smart Wallet instances.
 * Handles wallet address prediction, creation, and retrieval using ERC-4337 account abstraction.
 */
export class DefaultSmartWalletProvider extends SmartWalletProvider {
  /** Manages supported blockchain networks */
  private chainManager: ChainManager
  /** Provider for lending market operations */
  private lendProvider?: LendProvider<LendConfig>
  /** Optional 16-byte attribution suffix appended to callData */
  private attributionSuffix?: Hex

  /**
   * Initialize the Smart Wallet Provider
   * @param chainManager - Manages supported blockchain networks
   * @param paymasterAndBundlerUrl - URL for ERC-4337 bundler and paymaster services
   * @param lendProvider - Provider for lending market operations
   */
  constructor(
    chainManager: ChainManager,
    lendProvider?: LendProvider<LendConfig>,
    attributionSuffix?: string,
  ) {
    super()
    this.chainManager = chainManager
    this.lendProvider = lendProvider
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
   * @description Creates a new smart wallet that will be deployed on first transaction.
   * The wallet address is deterministically calculated from owners and nonce.
   * @param owners - Array of wallet owners (addresses or WebAuthn public keys)
   * @param signer - Local account used for signing transactions
   * @param nonce - Optional nonce for address generation (defaults to 0)
   * @returns Promise resolving to a new SmartWallet instance
   */
  async createWallet(params: {
    owners: Signer[]
    signer: LocalAccount
    nonce?: bigint
  }): Promise<DefaultSmartWallet> {
    const { owners, signer, nonce } = params
    return DefaultSmartWallet.create({
      owners,
      signer,
      chainManager: this.chainManager,
      lendProvider: this.lendProvider,
      nonce,
      attributionSuffix: this.attributionSuffix,
    })
  }

  /**
   * Get the predicted smart wallet address
   * @description Calculates the deterministic address where a smart wallet would be deployed
   * given the specified owners and nonce. Uses CREATE2 for address prediction.
   * @param params.owners - Array of wallet owners (addresses or WebAuthn public keys)
   * @param params.nonce - Nonce for address generation (defaults to 0)
   * @returns Promise resolving to the predicted wallet address
   */
  async getWalletAddress(params: { owners: Signer[]; nonce?: bigint }) {
    const { owners, nonce = 0n } = params
    const owners_bytes = owners.map((owner) => {
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
      args: [owners_bytes, nonce],
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
    ownerIndex?: number
  }): Promise<DefaultSmartWallet> {
    const { walletAddress, signer, ownerIndex } = params
    return DefaultSmartWallet.create({
      owners: [signer.address],
      signer,
      chainManager: this.chainManager,
      lendProvider: this.lendProvider,
      deploymentAddress: walletAddress,
      signerOwnerIndex: ownerIndex,
      attributionSuffix: this.attributionSuffix,
    })
  }
}
