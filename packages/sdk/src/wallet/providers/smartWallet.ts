import type { Address, LocalAccount } from 'viem'
import { pad } from 'viem'
import { type WebAuthnAccount } from 'viem/account-abstraction'

import { smartWalletFactoryAbi } from '@/abis/smartWalletFactory.js'
import { smartWalletFactoryAddress } from '@/constants/addresses.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProvider } from '@/types/lend.js'
import { SmartWallet } from '@/wallet/SmartWallet.js'

/**
 * Smart Wallet Provider
 * @description Factory for creating and managing Smart Wallet instances.
 * Handles wallet address prediction, creation, and retrieval using ERC-4337 account abstraction.
 */
export class SmartWalletProvider {
  /** Manages supported blockchain networks */
  private chainManager: ChainManager
  /** URL for ERC-4337 bundler and paymaster services */
  private paymasterAndBundlerUrl: string
  /** Provider for lending market operations */
  private lendProvider: LendProvider

  /**
   * Initialize the Smart Wallet Provider
   * @param chainManager - Manages supported blockchain networks
   * @param paymasterAndBundlerUrl - URL for ERC-4337 bundler and paymaster services
   * @param lendProvider - Provider for lending market operations
   */
  constructor(
    chainManager: ChainManager,
    paymasterAndBundlerUrl: string,
    lendProvider: LendProvider,
  ) {
    this.chainManager = chainManager
    this.paymasterAndBundlerUrl = paymasterAndBundlerUrl
    this.lendProvider = lendProvider
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
    owners: Array<Address | WebAuthnAccount>
    signer: LocalAccount
    nonce?: bigint
  }): Promise<SmartWallet> {
    const { owners, signer, nonce } = params
    return new SmartWallet(
      owners,
      signer,
      this.chainManager,
      this.lendProvider,
      this.paymasterAndBundlerUrl,
      undefined,
      undefined,
      nonce,
    )
  }

  /**
   * Get the predicted smart wallet address
   * @description Calculates the deterministic address where a smart wallet would be deployed
   * given the specified owners and nonce. Uses CREATE2 for address prediction.
   * @param params.owners - Array of wallet owners (addresses or WebAuthn public keys)
   * @param params.nonce - Nonce for address generation (defaults to 0)
   * @returns Promise resolving to the predicted wallet address
   */
  async getAddress(params: {
    owners: Array<Address | WebAuthnAccount>
    nonce?: bigint
  }) {
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
  getWallet(params: {
    walletAddress: Address
    signer: LocalAccount
    ownerIndex?: number
  }): SmartWallet {
    const { walletAddress, signer, ownerIndex } = params
    return new SmartWallet(
      [signer.address],
      signer,
      this.chainManager,
      this.lendProvider,
      this.paymasterAndBundlerUrl,
      walletAddress,
      ownerIndex,
    )
  }
}
