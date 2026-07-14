import { type EnsName, isEnsName } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { isAddress } from 'viem'

import { CliError } from '@/output/errors.js'
import { requireAddress } from '@/utils/addresses.js'

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
