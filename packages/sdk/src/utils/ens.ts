import type { Address, PublicClient } from 'viem'
import { isAddress } from 'viem'
import { mainnet } from 'viem/chains'
import { normalize } from 'viem/ens'

import type { EnsName } from '@/ens/types.js'

export { type EnsName, isEnsName } from '@/ens/types.js'

/**
 * Low-level utility to resolve an ENS name or hex address to a checksummed hex address.
 * Use this when you manage your own viem PublicClient (e.g. inside providers or scripts).
 *
 * If you have an {@link Actions} instance, prefer `actions.ens.resolve()` instead —
 * it handles client lookup automatically from your chain configuration.
 *
 * Hex addresses (0x...) are returned as-is after format validation.
 * ENS names require a mainnet public client for on-chain resolution.
 * @param input - Hex address (0x...) or ENS name (e.g. "vitalik.eth")
 * @param mainnetClient - Public client connected to Ethereum mainnet (required for ENS names)
 * @returns Resolved hex address
 * @throws If input is invalid, ENS name cannot be resolved, or resolved address is zero
 */
export async function resolveAddress(
  input: Address | EnsName,
  mainnetClient?: PublicClient,
): Promise<Address> {
  if (isAddress(input, { strict: false })) return input

  if (!mainnetClient) {
    throw new Error(
      `ENS resolution requires a mainnet public client. ` +
        `Add chain ID ${mainnet.id} to your chain configuration to resolve "${input}".`,
    )
  }

  const normalized = (() => {
    try {
      return normalize(input)
    } catch {
      throw new Error(`Invalid address or ENS name: "${input}"`)
    }
  })()

  const resolved = await mainnetClient
    .getEnsAddress({ name: normalized })
    .catch((cause: unknown) => {
      throw new Error(`ENS resolution failed for "${input}": RPC error`, {
        cause,
      })
    })

  if (!resolved) throw new Error(`ENS name "${input}" could not be resolved`)
  if (resolved.toLowerCase() === '0x0000000000000000000000000000000000000000') {
    throw new Error(`ENS name "${input}" resolved to the zero address`)
  }
  return resolved
}
