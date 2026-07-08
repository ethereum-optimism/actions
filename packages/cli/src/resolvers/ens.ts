import {
  type EnsName,
  isEnsName,
  type NameServiceProvider,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { isAddress } from 'viem'

import { CliError } from '@/output/errors.js'
import { requireAddress } from '@/utils/addresses.js'

export interface WalletAddressFlags {
  address?: string
  ens?: string
}

/**
 * @description Requires ENS-name-shaped input before forward lookup.
 * @param input - Raw positional argument from argv.
 * @returns The input narrowed to `EnsName`.
 * @throws `CliError` with code `validation` when the input is not name-shaped.
 */
export function requireEnsName(input: string): EnsName {
  if (!isEnsName(input)) {
    throw new CliError(
      'validation',
      `Invalid ENS name: "${input}" (expected a dot-separated name, e.g. vitalik.eth)`,
      { input },
    )
  }
  return input
}

/**
 * @description Resolves a mutually-exclusive `--address` / `--ens` flag pair to a wallet address.
 * @param ensResolver - ENS service used when `--ens` is provided.
 * @param flags - Commander-parsed address flags.
 * @returns Checksummed wallet address.
 * @throws `CliError` with code `validation` when neither or both flags are provided, or when either flag is malformed.
 */
export async function resolveWalletAddress(
  ensResolver: Pick<NameServiceProvider, 'getAddress'>,
  flags: WalletAddressFlags,
): Promise<Address> {
  const { address, ens } = flags
  if (address && ens) {
    throw new CliError(
      'validation',
      'Pass either --address or --ens, not both',
      { address, ens },
    )
  }
  if (address) return requireAddress(address, '--address')
  if (ens) return ensResolver.getAddress(requireEnsName(ens))
  throw new CliError('validation', 'One of --address or --ens is required')
}

/**
 * @description Requires either an ENS name or checksummed address for info lookup.
 * @param input - Raw positional argument from argv.
 * @returns The input as a checksummed `Address` or an `EnsName`.
 * @throws `CliError` with code `validation` when the input is neither.
 */
export function requireEnsNameOrAddress(
  input: string,
  label = 'input',
): Address | EnsName {
  if (isAddress(input)) return requireAddress(input)
  if (isEnsName(input)) return input
  throw new CliError(
    'validation',
    `Invalid ${label}: "${input}" (expected an ENS name or a 0x-prefixed address)`,
    { [label]: input },
  )
}
