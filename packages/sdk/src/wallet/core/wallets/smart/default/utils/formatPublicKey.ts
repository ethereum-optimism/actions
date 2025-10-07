import type { Address, Hex } from 'viem'
import { isAddress, pad } from 'viem'

/**
 * Formats 20 byte addresses to 32 byte public keys. Contract uses 32 byte keys for owners.
 * @param publicKey - The public key to format
 * @returns The formatted public key
 */
export function formatPublicKey(publicKey: Hex | Address): Hex {
  if (isAddress(publicKey)) {
    return pad(publicKey)
  }
  return publicKey
}
