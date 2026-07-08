import type { NameServiceProvider } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

import { CliError } from '@/output/errors.js'
import { requireEnsName } from '@/resolvers/ens.js'
import { requireAddress } from '@/utils/addresses.js'

export interface WalletAddressFlags {
  address?: string
  ens?: string
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
