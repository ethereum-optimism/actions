import type { Address, LocalAccount } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'

export * from '@/wallet/core/wallets/abstract/types/index.js'
/**
 * Options for creating a smart wallet
 * @description Parameters for creating a new smart wallet with specified owners and signer
 */
export type CreateSmartWalletOptions = {
  signer: LocalAccount
  signers?: Signer[]
  nonce?: bigint
  deploymentChainIds?: SupportedChainId[]
}

/**
 * Options for retrieving a smart wallet with provided signer
 * @description Parameters for getting an existing smart wallet using a provided LocalAccount signer
 */
export type GetSmartWalletOptions = {
  signer: LocalAccount
  signers?: Signer[]
  deploymentSigners?: Signer[]
  walletAddress?: Address
  nonce?: bigint
}
