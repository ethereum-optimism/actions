import type { Client, Hex } from 'viem'
import { readContract } from 'viem/actions'

import { smartWalletAbi } from '@/wallet/core/wallets/smart/default/constants/index.js'
import { formatPublicKey } from '@/wallet/core/wallets/smart/default/utils/formatPublicKey.js'

type FindSignerIndexOnChainParams = {
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
  signerPublicKey: Hex
}

/**
 * Find the index of a signer in a smart wallet
 * @description Iterates over the wallet's owner slots from highest to lowest index
 * (using the contract's `nextOwnerIndex` and `ownerAtIndex`) to locate the provided signer.
 * The signer may be an EOA address or a WebAuthn account; in both cases it is normalized via
 * {@link formatPublicKey} to the 32-byte form used by the contract for comparisons.
 * Returns the owner's index if found, otherwise -1.
 * @param address - Address of the smart wallet contract to inspect
 * @param client - Public client used to perform contract reads
 * @param signerPublicKey - Signer public key to search for (EOA `Address` or `WebAuthnAccount`)
 * @returns Promise that resolves to the 0-based signer index, or -1 if not found
 */
export async function findSignerIndexOnChain({
  address,
  client,
  signerPublicKey,
}: FindSignerIndexOnChainParams): Promise<number> {
  const nextOwnerIndex = await readContract(client, {
    address,
    abi: smartWalletAbi,
    functionName: 'nextOwnerIndex',
  })
  const formattedSignerPublicKey = formatPublicKey(signerPublicKey)

  // Iterate from highest index down and return early when found
  for (let i = Number(nextOwnerIndex) - 1; i >= 0; i--) {
    const signerAtIndex = await readContract(client, {
      address,
      abi: smartWalletAbi,
      functionName: 'ownerAtIndex',
      args: [BigInt(i)],
    })

    // Skip empty slots (deleted owners)
    if (!signerAtIndex || signerAtIndex === '0x') continue

    if (
      signerAtIndex.toLowerCase() === formattedSignerPublicKey.toLowerCase()
    ) {
      return i
    }
  }

  return -1
}
