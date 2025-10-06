import { getAddress, type LocalAccount } from 'viem'

import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'

/**
 * Find the index of a signer in the signers array
 * @description Searches through the signers array to find the index where the signer matches.
 * We only support signer type of LocalAccount for now.
 * @param signers - Array of wallet signers (addresses, LocalAccounts, or WebAuthn accounts)
 * @param signer - The signer to find in the signers array
 * @returns The index of the signer in the signers array
 */
export function findSignerInArray(
  signers: Signer[],
  signer: LocalAccount,
): number {
  return signers.findIndex((signerEntry) => {
    // we only support signer type of LocalAccount for now
    if (typeof signerEntry === 'string') {
      // EOA address comparison
      return getAddress(signerEntry) === getAddress(signer.address)
    }

    if (signerEntry.type === 'local') {
      return getAddress(signerEntry.address) === getAddress(signer.address)
    }

    return false
  })
}
