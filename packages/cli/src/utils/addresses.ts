import type { Address } from 'viem'
import { getAddress, isAddress } from 'viem'

import { CliError } from '@/output/errors.js'

/**
 * @description Requires a valid address and returns its checksummed form.
 * @param input - Raw address value.
 * @param label - Human-readable field label for error messages and details.
 * @returns The checksummed `Address`.
 * @throws `CliError` with code `validation` when the input is not an address.
 */
export function requireAddress(input: string, label = 'address'): Address {
  if (!isAddress(input)) {
    throw new CliError(
      'validation',
      `Invalid ${label}: "${input}" (expected a 0x-prefixed 20-byte address)`,
      { [label]: input },
    )
  }
  return getAddress(input)
}
