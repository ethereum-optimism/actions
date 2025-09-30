import type { Hex } from 'viem'
import { pad } from 'viem'

import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'

/**
 * Normalize a signer identifier to the 32-byte public key format
 * @description The smart wallet stores owner identifiers as 32-byte values.
 * - For EOA owners (20-byte addresses), this pads the address to 32 bytes
 * (left-padded with zeros) using viem's `pad`.
 * - For WebAuthn owners, the 32-byte `publicKey` is returned as-is.
 * @param signer - EOA `Address` or `WebAuthnAccount` to normalize
 * @returns 32-byte `Hex` value suitable for on-chain comparisons
 * @throws Error if the signer type is not recognized
 */
export function formatPublicKey(signer: Signer): Hex {
  if (typeof signer === 'string') return pad(signer)
  if (signer.type === 'webAuthn') return signer.publicKey
  throw new Error('invalid signer type')
}
