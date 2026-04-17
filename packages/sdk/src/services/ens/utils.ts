import type { Address, PublicClient } from 'viem'
import { isAddress, isAddressEqual, zeroAddress } from 'viem'
import { normalize } from 'viem/ens'

import {
  EnsNotConfiguredError,
  EnsResolutionError,
  EnsRpcError,
} from '@/services/ens/errors.js'
import type { EnsName } from '@/services/ens/types.js'

export { type EnsName, isEnsName } from '@/services/ens/types.js'

/** Resolves an ENS name or address to a checksummed hex Address, or returns undefined. */
export type RecipientResolver = (
  recipient: Address | EnsName | undefined,
) => Promise<Address | undefined>

/** Pass-through resolver used when no ENS resolution is configured. Throws on ENS names. */
export const passthroughResolver: RecipientResolver = (r) => {
  if (r !== undefined && !isAddress(r, { strict: false })) {
    throw new Error(`ENS resolution is not configured; received "${r}"`)
  }
  return Promise.resolve(r as Address | undefined)
}

/**
 * Low-level utility to resolve an ENS name or hex address to a checksummed hex address.
 * Use this when you manage your own viem PublicClient (e.g. inside providers or scripts).
 *
 * If you have an {@link Actions} instance, prefer `actions.ens.getAddress()` instead —
 * it handles client lookup and fallback automatically from your chain configuration.
 *
 * Hex addresses (0x...) are returned as-is after format validation.
 * ENS names require a mainnet public client for on-chain resolution.
 * @param input - Hex address (0x...) or ENS name (e.g. "vitalik.eth")
 * @param mainnetClient - Public client connected to Ethereum mainnet (required for ENS names)
 * @returns Resolved hex address
 * @throws {EnsNotConfiguredError} If mainnet client is not provided
 * @throws {EnsResolutionError} If the name is invalid or cannot be resolved
 * @throws {EnsRpcError} If the RPC call fails
 */
export async function resolveAddress(
  input: Address | EnsName,
  mainnetClient?: PublicClient,
): Promise<Address> {
  if (isAddress(input, { strict: false })) return input

  if (!mainnetClient) throw new EnsNotConfiguredError()

  const normalized = (() => {
    try {
      return normalize(input)
    } catch (cause) {
      throw new EnsResolutionError(
        `Invalid address or ENS name: "${input}"`,
        input,
        { cause },
      )
    }
  })()

  const resolved = await mainnetClient
    .getEnsAddress({ name: normalized })
    .catch((cause: unknown) => {
      throw new EnsRpcError(
        `ENS resolution failed for "${input}": RPC error`,
        input,
        { cause },
      )
    })

  if (!resolved)
    throw new EnsResolutionError(
      `ENS name "${input}" could not be resolved`,
      input,
    )
  if (isAddressEqual(resolved, zeroAddress)) {
    throw new EnsResolutionError(
      `ENS name "${input}" resolved to the zero address`,
      input,
    )
  }
  return resolved
}
