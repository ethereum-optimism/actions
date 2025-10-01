import type { Address } from 'viem'
import type { WebAuthnAccount } from 'viem/account-abstraction'

/**
 * Signer type for smart wallets
 * @description Ethereum address (EOA) or a `WebAuthnAccount`
 */
export type Signer = Address | WebAuthnAccount
