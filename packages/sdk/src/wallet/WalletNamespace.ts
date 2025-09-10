import type {
  CreateSmartWalletOptions,
  GetSmartWalletOptions,
  HostedWalletToVerbsWalletOptions,
} from '@/types/wallet.js'
import type { SmartWallet } from '@/wallet/base/SmartWallet.js'
import type { Wallet } from '@/wallet/base/Wallet.js'
import type { WalletProvider } from '@/wallet/WalletProvider.js'

import type { HostedWalletProvider } from './providers/base/HostedWalletProvider.js'
import type { SmartWalletProvider } from './providers/base/SmartWalletProvider.js'

/**
 * Wallet namespace that provides unified wallet operations
 * @description Provides access to wallet functionality through a single provider interface
 */
export class WalletNamespace<
  H extends HostedWalletProvider<any> = HostedWalletProvider<any>,
  S extends SmartWalletProvider = SmartWalletProvider,
> {
  private provider: WalletProvider<H, S>

  constructor(provider: WalletProvider<H, S>) {
    this.provider = provider
  }

  /**
   * Get direct access to the hosted wallet provider
   * @description Provides direct access to the underlying hosted wallet provider when
   * advanced functionality beyond the unified interface is needed
   * @returns The configured hosted wallet provider instance
   */
  get hostedWalletProvider(): H {
    return this.provider.hostedWalletProvider
  }

  /**
   * Get direct access to the smart wallet provider
   * @description Provides direct access to the underlying smart wallet provider when
   * advanced functionality beyond the unified interface is needed
   * @returns The configured smart wallet provider instance
   */
  get smartWalletProvider(): S {
    return this.provider.smartWalletProvider
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
    return this.provider.createSmartWallet(params)
  }

  /**
   * Convert a hosted wallet to a Verbs wallet
   * @description Converts a hosted wallet to a Verbs wallet instance.
   * @param params - Parameters for converting a hosted wallet to a Verbs wallet
   * @param params.walletId - Unique identifier for the hosted wallet
   * @param params.address - Ethereum address of the hosted wallet
   * @returns Promise resolving to the Verbs wallet instance
   */
  async hostedWalletToVerbsWallet(
    params: any,
  ): Promise<Wallet> {
    return this.provider.hostedWalletToVerbsWallet(params)
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
    return this.provider.getSmartWallet(params)
  }
}
