import { getAddress, type LocalAccount } from 'viem'

import type {
  CreateSmartWalletOptions,
  GetSmartWalletOptions,
} from '@/types/wallet.js'
import type { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { SmartWalletProvider } from '@/wallet/core/providers/smart/abstract/SmartWalletProvider.js'
import type { SmartWalletCreationResult } from '@/wallet/core/providers/smart/abstract/types/index.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { SmartWallet } from '@/wallet/core/wallets/smart/abstract/SmartWallet.js'

/**
 * Unified Wallet Provider
 * @description Main wallet provider that combines hosted wallet and smart wallet functionality.
 * Provides a unified interface for all wallet operations while supporting pluggable providers.
 */
export class WalletProvider<
  THostedProviderType extends string,
  TToActionsMap extends Record<THostedProviderType, unknown>,
  H extends HostedWalletProvider<THostedProviderType, TToActionsMap>,
  S extends SmartWalletProvider = SmartWalletProvider,
> {
  constructor(
    public readonly hostedWalletProvider: H,
    public readonly smartWalletProvider: S,
  ) {}

  /**
   * Create a new smart wallet
   * @description Creates a smart wallet and attempts to deploy it across all supported chains.
   * The wallet address is deterministically calculated from owners and nonce. The signer must
   * be included in the owners array. Deployment failures on individual chains do not prevent
   * wallet creation - they are reported in the result.
   * @param params - Smart wallet creation parameters
   * @param params.owners - Array of owners for the smart wallet (addresses or WebAuthn public keys)
   * @param params.signer - Local account used for signing transactions (must be in owners array)
   * @param params.nonce - Optional nonce for smart wallet address generation (defaults to 0)
   * @param params.deploymentChainIds - Optional chain IDs to deploy the wallet to.
   * If not provided, the wallet will be deployed to all supported chains.
   * @returns Promise resolving to deployment result containing:
   * - `wallet`: The created SmartWallet instance
   * - `deployments`: Array of deployment results with chainId, receipt, success flag, and error
   * @throws Error if signer is not included in the owners array
   */
  async createSmartWallet(
    params: CreateSmartWalletOptions,
  ): Promise<SmartWalletCreationResult<SmartWallet>> {
    const { owners, signer } = params

    if (
      owners.filter(
        (owner) =>
          typeof owner === 'string' &&
          getAddress(owner) === getAddress(signer.address),
      ).length === 0
    ) {
      throw new Error('Signer must be in the owners array')
    }

    return this.smartWalletProvider.createWallet({ ...params })
  }

  async hostedWalletToActionsWallet(
    params: TToActionsMap[THostedProviderType],
  ): Promise<Wallet> {
    return this.hostedWalletProvider.toActionsWallet(params)
  }

  /**
   * Create a viem LocalAccount signer from the hosted wallet
   * @description Produces a signing account backed by the hosted wallet without wrapping
   * it in a full Actions wallet. This is useful when you need to pass the signer
   * into an Actions smart wallet as a signer, for lower-level viem operations, or
   * for passing to other libraries that accept a viem `LocalAccount`.
   * @param params - Configuration for the signer
   * @returns Promise resolving to a viem `LocalAccount` with the hosted wallet as the signer backend
   */
  async createSigner(
    params: TToActionsMap[THostedProviderType],
  ): Promise<LocalAccount> {
    return this.hostedWalletProvider.createSigner(params)
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
      owners,
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
      owners,
    })
  }
}
