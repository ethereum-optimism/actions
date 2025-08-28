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
 * Options for creating a wallet with embedded signer
 * @description Parameters for creating both embedded and smart wallets, with embedded wallet automatically added as signer
 */
export type CreateWalletWithEmbeddedSignerOptions = {
  owners?: Array<Address | WebAuthnAccount>
  embeddedWalletIndex?: number
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

/**
 * Options for retrieving an embedded wallet
 * @description Parameters for getting an existing embedded wallet
 */
export type GetEmbeddedWalletOptions = {
  walletId: string
}

/**
 * Options for retrieving a smart wallet with embedded wallet signer
 * @description Parameters for getting an existing smart wallet using an embedded wallet as signer.
 * If neither walletAddress nor deploymentOwners is provided, defaults to using the embedded wallet as single owner.
 */
export type GetSmartWalletWithEmbeddedSignerOptions = Omit<
  GetSmartWalletOptions,
  'signer'
> &
  GetEmbeddedWalletOptions
