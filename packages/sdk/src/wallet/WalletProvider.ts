import { getAddress } from 'viem'

import type {
  CreateSmartWalletOptions,
  GetSmartWalletOptions,
  HostedWalletToVerbsWalletOptions,
} from '@/types/wallet.js'
import type { SmartWallet } from '@/wallet/base/SmartWallet.js'
import type { Wallet } from '@/wallet/base/Wallet.js'
import type { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'
import type { SmartWalletProvider } from '@/wallet/providers/base/SmartWalletProvider.js'

/**
 * Unified Wallet Provider
 * @description Main wallet provider that combines hosted wallet and smart wallet functionality.
 * Provides a unified interface for all wallet operations while supporting pluggable providers.
 */
export class WalletProvider<
  H extends HostedWalletProvider<any>,
  S extends SmartWalletProvider = SmartWalletProvider,
> {
  constructor(
    public readonly hostedWalletProvider: H,
    public readonly smartWalletProvider: S,
  ) {}

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

    if (
      owners.filter(
        (owner) =>
          typeof owner === 'string' &&
          getAddress(owner) === getAddress(signer.address),
      ).length === 0
    ) {
      throw new Error('Signer must be in the owners array')
    }

    return this.smartWalletProvider.createWallet({
      owners,
      signer,
      nonce,
    })
  }

  async hostedWalletToVerbsWallet(
    params: HostedWalletToVerbsWalletOptions,
  ): Promise<Wallet> {
    return this.hostedWalletProvider.toVerbsWallet(params)
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
