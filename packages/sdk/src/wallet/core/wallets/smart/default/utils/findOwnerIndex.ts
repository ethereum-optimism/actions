import type { Client } from 'viem'
import { readContract } from 'viem/actions'

import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'
import { smartWalletAbi } from '@/wallet/core/wallets/smart/default/constants/index.js'
import { formatPublicKey } from '@/wallet/core/wallets/smart/default/utils/formatPublicKey.js'

type FindOwnerIndexParams = {
  /**
   * The address of the account to get the owner index for
   */
  address: `0x${string}`
  /**
   * The client to use to get the code and read the contract
   */
  client: Client
  /**
   * The public key of the owner
   */
  signer: Signer
}

/**
 * Find the index of an owner in a smart wallet
 * @description Iterates over the wallet's owner slots from highest to lowest index
 * (using the contract's `nextOwnerIndex` and `ownerAtIndex`) to locate the provided signer.
 * The signer may be an EOA address or a WebAuthn account; in both cases it is normalized via
 * {@link formatPublicKey} to the 32-byte form used by the contract for comparisons.
 * Returns the owner's index if found, otherwise -1.
 * @param address - Address of the smart wallet contract to inspect
 * @param client - Public client used to perform contract reads
 * @param signer - Owner identifier to search for (EOA `Address` or `WebAuthnAccount`)
 * @returns Promise that resolves to the 0-based owner index, or -1 if not found
 */
export async function findOwnerIndex({
  address,
  client,
  signer,
}: FindOwnerIndexParams): Promise<number> {
  const nextOwnerIndex = await readContract(client, {
    address,
    abi: smartWalletAbi,
    functionName: 'nextOwnerIndex',
  })
  const formatted = formatPublicKey(signer)

  // Iterate from highest index down and return early when found
  for (let i = Number(nextOwnerIndex) - 1; i >= 0; i--) {
    const owner = await readContract(client, {
      address,
      abi: smartWalletAbi,
      functionName: 'ownerAtIndex',
      args: [BigInt(i)],
    })

    // Skip empty slots (deleted owners)
    if (!owner || owner === '0x') continue

    if (owner.toLowerCase() === formatted.toLowerCase()) {
      return i
    }
  }

  return -1
}
