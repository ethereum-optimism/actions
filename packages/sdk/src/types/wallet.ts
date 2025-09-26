import type { Address, LocalAccount } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'

/**
 * Options for creating a smart wallet
 * @description Parameters for creating a new smart wallet with specified owners and signer
 */
export type CreateSmartWalletOptions = {
  owners: Array<Address | WebAuthnAccount>
  signer: LocalAccount
  nonce?: bigint
}

/**
 * Options for retrieving a smart wallet with provided signer
 * @description Parameters for getting an existing smart wallet using a provided LocalAccount signer
 */
export type GetSmartWalletOptions = {
  signer: LocalAccount
  deploymentOwners?: Array<Address | WebAuthnAccount>
  signerOwnerIndex?: number
  walletAddress?: Address
  nonce?: bigint
}
