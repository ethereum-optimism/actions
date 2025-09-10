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
 * Options for creating a wallet with hosted signer
 * @description Parameters for creating both hosted and smart wallets, with hosted wallet automatically added as signer
 */
export type createWalletWithHostedSignerOptions = {
  owners?: Array<Address | WebAuthnAccount>
  hostedWalletIndex?: number
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
 * Options for retrieving a hosted wallet
 * @description Parameters for getting an existing hosted wallet
 */
export type getHostedWalletOptions = {
  walletId: string
}

/**
 * Options for retrieving a smart wallet with hosted wallet signer
 * @description Parameters for getting an existing smart wallet using a hosted wallet as signer.
 * If neither walletAddress nor deploymentOwners is provided, defaults to using the hosted wallet as single owner.
 */
export type getSmartWalletWithHostedSignerOptions = Omit<
  GetSmartWalletOptions,
  'signer'
> &
  getHostedWalletOptions
