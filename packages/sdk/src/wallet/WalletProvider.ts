import type { Address } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'

import type {
  CreateSmartWalletOptions,
  createWalletWithHostedSignerOptions,
  getHostedWalletOptions,
  GetSmartWalletOptions,
  getSmartWalletWithHostedSignerOptions,
} from '@/types/wallet.js'
import type { HostedWallet } from '@/wallet/base/HostedWallet.js'
import type { SmartWallet } from '@/wallet/base/SmartWallet.js'
import type { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'
import type { SmartWalletProvider } from '@/wallet/providers/base/SmartWalletProvider.js'

/**
 * Unified Wallet Provider
 * @description Main wallet provider that combines hosted wallet and smart wallet functionality.
 * Provides a unified interface for all wallet operations while supporting pluggable providers.
 */
export class WalletProvider {
  constructor(
    public readonly hostedWalletProvider: HostedWalletProvider,
    public readonly smartWalletProvider: SmartWalletProvider,
  ) {}

  /**
   * Create a new hosted wallet
   * @description Creates only a hosted wallet using the configured hosted wallet provider.
   * @returns Promise resolving to the created hosted wallet instance
   */
  async createHostedWallet(): Promise<HostedWallet> {
    return this.hostedWalletProvider.createWallet()
  }

  /**
   * Create a new smart wallet
   * @description Creates only a smart wallet using the configured smart wallet provider.
   * This is useful when you already have a signer and want to create a smart wallet without
   * creating a hosted wallet. You must provide your own signer and owners array.
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
   * Create a new smart wallet with hosted wallet as signer
   * @description Creates both a hosted wallet and a smart wallet, with the hosted wallet
   * automatically added as one of the owners/signers of the smart wallet.
   * @param params - Optional wallet creation parameters
   * @param params.owners - Optional array of additional owners for the smart wallet. The hosted wallet will be added to this array at the specified index.
   * @param params.hostedWalletIndex - Optional index where the hosted wallet should be inserted in the owners array. If not specified, hosted wallet is added to the end of the array.
   * @param params.nonce - Optional nonce for smart wallet address generation (defaults to 0)
   * @returns Promise resolving to the created smart wallet instance
   */
  async createWalletWithHostedSigner(
    params?: createWalletWithHostedSignerOptions,
  ): Promise<SmartWallet> {
    const { owners: ownersParam, hostedWalletIndex, nonce } = params || {}
    const hostedWallet = await this.hostedWalletProvider.createWallet()
    const account = await hostedWallet.account()

    let owners: Array<Address | WebAuthnAccount>
    if (ownersParam) {
      // Create a copy to avoid mutating the original
      owners = [...ownersParam]
      const insertIndex = hostedWalletIndex ?? owners.length
      owners.splice(insertIndex, 0, hostedWallet.address)
    } else {
      owners = [hostedWallet.address]
    }

    return this.smartWalletProvider.createWallet({
      owners,
      signer: account,
      nonce,
    })
  }

  /**
   * Get an existing smart wallet using hosted wallet as signer
   * @description Retrieves a hosted wallet by walletId and uses it as the signer to get
   * the corresponding smart wallet. This is useful when you have
   * a hosted wallet ID and want to access the associated smart wallet functionality.
   * @dev If neither walletAddress nor deploymentOwners is provided,
   * defaults to using the hosted wallet as the single owner.
   * @param params - Wallet retrieval parameters
   * @param params.walletId - ID of the hosted wallet to use as signer
   * @param params.deploymentOwners - Optional array of original deployment owners for smart wallet address calculation. If not provided and walletAddress is also not provided, defaults to using the hosted wallet as single owner.
   * @param params.signerOwnerIndex - Current index of the signer in the smart wallet's current owners array (used for transaction signing). Defaults to 0 if not specified. This may differ from the original deployment index if owners have been modified.
   * @param params.walletAddress - Optional explicit smart wallet address (skips address calculation)
   * @param params.nonce - Optional nonce used during smart wallet creation
   * @returns Promise resolving to the smart wallet instance with hosted wallet as signer
   * @throws Error if hosted wallet is not found
   */
  async getSmartWalletWithHostedSigner(
    params: getSmartWalletWithHostedSignerOptions,
  ) {
    const { walletId, deploymentOwners, walletAddress } = params
    const hostedWallet = await this.hostedWalletProvider.getWallet({
      walletId,
    })
    if (!hostedWallet) {
      throw new Error('Hosted wallet not found')
    }
    const account = await hostedWallet.account()

    // If neither walletAddress nor deploymentOwners provided, default to hosted wallet as single owner
    const finalDeploymentOwners =
      deploymentOwners || (walletAddress ? undefined : [hostedWallet.address])

    return this.getSmartWallet({
      signer: account,
      ...params,
      deploymentOwners: finalDeploymentOwners,
    })
  }

  /**
   * Get an existing hosted wallet
   * @description Retrieves a hosted wallet by walletId. This is useful when you have a hosted wallet ID and
   * want to access the associated hosted wallet functionality.
   * @param params - Wallet retrieval parameters
   * @param params.walletId - ID of the hosted wallet to retrieve
   * @returns Promise resolving to the hosted wallet instance
   */
  async getHostedWallet(params: getHostedWalletOptions) {
    const { walletId } = params
    return this.hostedWalletProvider.getWallet({
      walletId,
    })
  }

  /**
   * Get an existing smart wallet with a provided signer
   * @description Retrieves a smart wallet using a directly provided signer. This is useful when
   * you already have a LocalAccount signer and want to access an existing smart wallet without
   * going through the hosted wallet provider. Use this instead of getSmartWalletWithHostedSigner
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
