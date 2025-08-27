import type { Address } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'

/**
 * Options for getting a wallet
 * @description Parameters for getting a wallet
 */
export type GetWalletOptions = {
  walletId: string
  owners?: Array<Address | WebAuthnAccount>
  signerOwnerIndex?: number
  walletAddress?: Address
  nonce?: bigint
}
