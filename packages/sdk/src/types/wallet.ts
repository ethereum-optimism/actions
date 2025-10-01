import type { Address, LocalAccount } from 'viem'

import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'

/**
 * Options for creating a smart wallet
 * @description Parameters for creating a new smart wallet with specified owners and signer
 */
export type CreateSmartWalletOptions = {
  owners: Signer[]
  signer: LocalAccount
  nonce?: bigint
}

/**
 * Options for retrieving a smart wallet with provided signer
 * @description Parameters for getting an existing smart wallet using a provided LocalAccount signer
 */
export type GetSmartWalletOptions = {
  signer: LocalAccount
  deploymentOwners?: Signer[]
  signerOwnerIndex?: number
  walletAddress?: Address
  nonce?: bigint
}
