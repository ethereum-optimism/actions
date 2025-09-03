import type { Address } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'

import type {
  CreateSmartWalletOptions,
  CreateWalletWithEmbeddedSignerOptions,
  GetEmbeddedWalletOptions,
  GetSmartWalletOptions,
  GetSmartWalletWithEmbeddedSignerOptions,
} from '@/types/wallet.js'
import type { EmbeddedWallet } from '@/wallet/base/EmbeddedWallet.js'
import type { SmartWallet } from '@/wallet/base/SmartWallet.js'
import type { EmbeddedWalletProvider } from '@/wallet/providers/base/EmbeddedWalletProvider.js'
import type { SmartWalletProvider } from '@/wallet/providers/base/SmartWalletProvider.js'

/**
 * Unified Wallet Provider
 * @description Main wallet provider that combines embedded wallet and smart wallet functionality.
 * Provides a unified interface for all wallet operations while supporting pluggable providers.
 */
export class WalletProvider {
  public readonly embeddedWalletProvider: EmbeddedWalletProvider
  public readonly smartWalletProvider: SmartWalletProvider

  constructor(
    embeddedWalletProvider: EmbeddedWalletProvider,
    smartWalletProvider: SmartWalletProvider,
  ) {
    this.embeddedWalletProvider = embeddedWalletProvider
    this.smartWalletProvider = smartWalletProvider
  }

  /**
   * Create a new embedded wallet
   * @description Creates only an embedded wallet using the configured embedded wallet provider.
   * @returns Promise resolving to the created embedded wallet instance
   */
  async createEmbeddedWallet(): Promise<EmbeddedWallet> {
    return this.embeddedWalletProvider.createWallet()
  }

  /**
   * Create a new smart wallet
   * @description Creates only a smart wallet using the configured smart wallet provider.
   * This is useful when you already have a signer and want to create a smart wallet without
   * creating an embedded wallet. You must provide your own signer and owners array.
   * @param params - Smart wallet creation parameters
   * @param params.owners - Array of owners for the smart wallet (addresses or WebAuthn public keys)
   * @param params.signer - Local account used for signing transactions
   * @param params.nonce - Optional nonce for smart wallet address generation (defaults to 0)
   * @returns Promise resolving to the created smart wallet instance
   */
  async createSmartWallet(
    params: CreateSmartWalletOptions,
  ): Promise<SmartWallet> {
    const { owners, signer, nonce } = params

    return this.smartWalletProvider.createWallet({
      owners,
      signer,
      nonce,
    })
  }

  /**
   * Create a new smart wallet with embedded wallet as signer
   * @description Creates both an embedded wallet and a smart wallet, with the embedded wallet
   * automatically added as one of the owners/signers of the smart wallet.
   * @param params - Optional wallet creation parameters
   * @param params.owners - Optional array of additional owners for the smart wallet. The embedded wallet will be added to this array at the specified index.
   * @param params.embeddedWalletIndex - Optional index where the embedded wallet should be inserted in the owners array. If not specified, embedded wallet is added to the end of the array.
   * @param params.nonce - Optional nonce for smart wallet address generation (defaults to 0)
   * @returns Promise resolving to the created smart wallet instance
   */
  async createWalletWithEmbeddedSigner(
    params?: CreateWalletWithEmbeddedSignerOptions,
  ): Promise<SmartWallet> {
    const { owners: ownersParam, embeddedWalletIndex, nonce } = params || {}
    const embeddedWallet = await this.embeddedWalletProvider.createWallet()
    const account = await embeddedWallet.account()

    let owners: Array<Address | WebAuthnAccount>
    if (ownersParam) {
      owners = [...ownersParam] // Create a copy to avoid mutating the original
      const insertIndex = embeddedWalletIndex ?? owners.length // Default to end if not specified
      owners.splice(insertIndex, 0, embeddedWallet.address) // Insert embedded wallet at specified index
    } else {
      owners = [embeddedWallet.address] // Default to just the embedded wallet
    }

    return this.smartWalletProvider.createWallet({
      owners,
      signer: account,
      nonce,
    })
  }

  /**
   * Get an existing smart wallet using embedded wallet as signer
   * @description Retrieves an embedded wallet by walletId and uses it as the signer to get
   * the corresponding smart wallet. This is useful when you have
   * an embedded wallet ID and want to access the associated smart wallet functionality.
   * @dev If neither walletAddress nor deploymentOwners is provided,
   * defaults to using the embedded wallet as the single owner.
   * @param params - Wallet retrieval parameters
   * @param params.walletId - ID of the embedded wallet to use as signer
   * @param params.deploymentOwners - Optional array of original deployment owners for smart wallet address calculation. If not provided and walletAddress is also not provided, defaults to using the embedded wallet as single owner.
   * @param params.signerOwnerIndex - Current index of the signer in the smart wallet's current owners array (used for transaction signing). Defaults to 0 if not specified. This may differ from the original deployment index if owners have been modified.
   * @param params.walletAddress - Optional explicit smart wallet address (skips address calculation)
   * @param params.nonce - Optional nonce used during smart wallet creation
   * @returns Promise resolving to the smart wallet instance with embedded wallet as signer
   * @throws Error if embedded wallet is not found
   */
  async getSmartWalletWithEmbeddedSigner(
    params: GetSmartWalletWithEmbeddedSignerOptions,
  ) {
    const { walletId, deploymentOwners, walletAddress } = params
    const embeddedWallet = await this.embeddedWalletProvider.getWallet({
      walletId,
    })
    if (!embeddedWallet) {
      throw new Error('Embedded wallet not found')
    }
    const account = await embeddedWallet.account()

    // If neither walletAddress nor deploymentOwners provided, default to embedded wallet as single owner
    const finalDeploymentOwners =
      deploymentOwners || (walletAddress ? undefined : [embeddedWallet.address])

    return this.getSmartWallet({
      signer: account,
      ...params,
      deploymentOwners: finalDeploymentOwners,
    })
  }

  /**
   * Get an existing embedded wallet
   * @description Retrieves an embedded wallet by walletId. This is useful when you have an embedded wallet ID and
   * want to access the associated embedded wallet functionality.
   * @param params - Wallet retrieval parameters
   * @param params.walletId - ID of the embedded wallet to retrieve
   * @returns Promise resolving to the embedded wallet instance
   */
  async getEmbeddedWallet(params: GetEmbeddedWalletOptions) {
    const { walletId } = params
    return this.embeddedWalletProvider.getWallet({
      walletId,
    })
  }

  /**
   * Get an existing smart wallet with a provided signer
   * @description Retrieves a smart wallet using a directly provided signer. This is useful when
   * you already have a LocalAccount signer and want to access an existing smart wallet without
   * going through the embedded wallet provider. Use this instead of getSmartWalletWithEmbeddedSigner
   * when you have direct control over the signer.
   * @param signer - Local account to use for signing transactions on the smart wallet
   * @param getWalletParams - Wallet retrieval parameters
   * @param getWalletParams.deploymentOwners - Array of original deployment owners for smart wallet address calculation. Required if walletAddress not provided. Must match the exact owners array used during wallet deployment.
   * @param getWalletParams.signerOwnerIndex - Current index of the signer in the smart wallet's current owners array (used for transaction signing). Defaults to 0 if not specified. This may differ from the original deployment index if owners have been modified.
   * @param getWalletParams.walletAddress - Optional explicit smart wallet address (skips address calculation)
   * @param getWalletParams.nonce - Optional nonce used during smart wallet creation
   * @returns Promise resolving to the smart wallet instance with the provided signer
   * @throws Error if neither walletAddress nor deploymentOwners provided
   */
  async getSmartWallet(params: GetSmartWalletOptions) {
    const {
      signer,
      deploymentOwners,
      signerOwnerIndex,
      walletAddress: walletAddressParam,
      nonce,
    } = params

    if (!walletAddressParam && !deploymentOwners) {
      try {
        throw new Error(
          'Either walletAddress or deploymentOwners array must be provided to locate the smart wallet',
        )
      } catch (error) {
        console.error(error)
        throw new Error(
          'Either walletAddress or deploymentOwners array must be provided to locate the smart wallet',
        )
      }
    }

    const ownerIndex = signerOwnerIndex ?? 0

    const walletAddress =
      walletAddressParam ||
      (await this.smartWalletProvider.getWalletAddress({
        // Safe to use ! since we validated above
        owners: deploymentOwners!,
        nonce,
      }))
    return this.smartWalletProvider.getWallet({
      walletAddress,
      signer,
      ownerIndex,
    })
  }
}
