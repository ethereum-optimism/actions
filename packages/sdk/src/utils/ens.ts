import type { Address, PublicClient } from 'viem'
import { isAddress } from 'viem'
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'

/**
 * Resolve an Ethereum address or ENS name to a checksummed hex address.
 * Hex addresses (0x...) are returned as-is after format validation.
 * ENS names require a mainnet public client for on-chain resolution.
 * @param input - Hex address (0x...) or ENS name (e.g. "vitalik.eth")
 * @param mainnetClient - Public client connected to Ethereum mainnet (required for ENS names)
 * @returns Resolved hex address
 * @throws If input is invalid, ENS name cannot be resolved, or resolved address is zero
 */
export async function resolveAddress(
  input: string,
  mainnetClient?: PublicClient,
): Promise<Address> {
  if (isAddress(input)) return input as Address

  if (!mainnetClient) {
    throw new Error(
      `ENS resolution requires a mainnet public client. ` +
        `Add chain ID ${mainnet.id} to your chain configuration to resolve "${input}".`,
    )
  }

  let normalized: string
  try {
    normalized = normalize(input)
  } catch {
    throw new Error(`Invalid address or ENS name: "${input}"`)
  }

  let resolved: Address | null
  try {
    resolved = await mainnetClient.getEnsAddress({ name: normalized })
  } catch (cause) {
    throw new Error(`ENS resolution failed for "${input}": RPC error`, { cause })
  }

  if (!resolved) {
    throw new Error(`ENS name "${input}" could not be resolved`)
  }

  if (resolved.toLowerCase() === '0x0000000000000000000000000000000000000000') {
    throw new Error(`ENS name "${input}" resolved to the zero address`)
  }

  return resolved
}
