import type { Address, LocalAccount } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { SmartWalletCreationResult } from '@/wallet/core/providers/smart/abstract/types/index.js'
import type { SmartWallet } from '@/wallet/core/wallets/smart/abstract/SmartWallet.js'
import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'

/**
 * Base smart wallet provider interface
 * @description Abstract interface for smart wallet providers.
 */
export abstract class SmartWalletProvider {
  /**
   * Create a new smart wallet instance
   * @description Creates a new smart wallet and attempts to deploy it across all supported chains.
   * The wallet address is deterministically calculated from signers and nonce. Deployment failures
   * on individual chains do not prevent wallet creation - they are reported in the result.
   * @param params - Wallet creation parameters
   * @param params.signers - Array of wallet signers
   * @param params.signer - Local account used for signing transactions
   * @param params.nonce - Optional nonce for address generation (defaults to 0)
   * @param params.deploymentChainIds - Optional chain IDs to deploy the wallet to.
   * If not provided, the wallet will be deployed to all supported chains.
   * @returns Promise resolving to deployment result containing:
   * - `wallet`: The created SmartWallet instance
   * - `deployments`: Array of deployment results with chainId, receipt, success flag, and error
   */
  abstract createWallet(params: {
    signer: LocalAccount
    signers?: Signer[]
    nonce?: bigint
    deploymentChainIds?: SupportedChainId[]
  }): Promise<SmartWalletCreationResult<SmartWallet>>

  /**
   * Get an existing smart wallet instance
   * @description Creates a SmartWallet instance for an already deployed wallet.
   * Use this when you know the wallet address and want to interact with it.
   * @param params - Wallet retrieval parameters
   * @param params.walletAddress - Address of the deployed smart wallet
   * @param params.signer - Local account used for signing transactions
   * @param params.signers - Array of wallet signers
   * @returns SmartWallet instance for the existing wallet
   */
  abstract getWallet(params: {
    walletAddress: Address
    signer: LocalAccount
    signers?: Signer[]
  }): Promise<SmartWallet>

  /**
   * Get the predicted smart wallet address
   * @description Calculates the deterministic address where a smart wallet would be deployed
   * given the specified signers and nonce. Uses CREATE2 for address prediction.
   * @param params - Address prediction parameters
   * @param params.signers - Array of wallet signers
   * @param params.nonce - Nonce for address generation (defaults to 0)
   * @returns Promise resolving to the predicted wallet address
   */
  abstract getWalletAddress(params: {
    signers: Signer[]
    nonce?: bigint
  }): Promise<Address>
}
