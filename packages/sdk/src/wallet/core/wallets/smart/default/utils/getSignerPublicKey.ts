import type { Hex } from 'viem'

import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'

/**
 * Extracts the public key or identifier from a smart wallet signer.
 *
 * Returns the appropriate public identifier for each signer type:
 * - Address: returns the address itself
 * - LocalAccount: returns the account's address
 * - WebAuthnAccount: returns the P256 public key
 */
export function getSignerPublicKey(signer: Signer): Hex {
  if (typeof signer === 'string') return signer
  if (signer.type === 'webAuthn') return signer.publicKey
  if (signer.type === 'local') return signer.address
  throw new Error('invalid signer type')
}
