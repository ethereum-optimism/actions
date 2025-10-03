import { getAddress, type LocalAccount } from 'viem'

import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'

/**
 * Find the index of a signer in the owners array
 * @description Searches through the owners array to find the index where the signer matches.
 * We only support signer type of LocalAccount for now.
 * @param owners - Array of wallet owners (addresses, LocalAccounts, or WebAuthn accounts)
 * @param signer - The signer to find in the owners array
 * @returns The index of the signer in the owners array
 */
export function findSignerIndex(
  owners: Signer[],
  signer: LocalAccount,
): number {
  if (signer.type !== 'local') {
    throw new Error('Signer is not a LocalAccount')
  }

  return owners.findIndex((owner) => {
    // we only support signer type of LocalAccount for now
    if (typeof owner === 'string') {
      // EOA address comparison
      return getAddress(owner) === getAddress(signer.address)
    }

    return false
  })
}
