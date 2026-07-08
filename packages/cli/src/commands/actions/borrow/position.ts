import type { Address } from 'viem'

import { baseContext } from '@/context/baseContext.js'
import { CliError, rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import {
  configuredBorrowMarkets,
  resolveBorrowMarket,
} from '@/resolvers/borrowMarkets.js'
import { requireEnsName } from '@/resolvers/ens.js'
import { requireAddress } from '@/utils/addresses.js'

type BaseContext = ReturnType<typeof baseContext>

export interface BorrowPositionFlags {
  market: string
  address?: string
  ens?: string
}

/**
 * @description Handler for `actions borrow position --market <name> (--address <address> | --ens <name>)`.
 * @param flags - Commander-parsed options.
 * @returns Promise that resolves once stdout has been written.
 * @throws `CliError` with code `validation` or `network`.
 */
export async function runBorrowPosition(
  flags: BorrowPositionFlags,
): Promise<void> {
  const { actions, config } = baseContext()
  const market = resolveBorrowMarket(
    flags.market,
    configuredBorrowMarkets(config),
  )
  try {
    const walletAddress = await resolveWalletAddress(actions, flags)
    const position = await actions.borrow.getPosition({
      marketId: market,
      walletAddress,
    })
    printOutput('borrowPosition', position)
  } catch (err) {
    rethrowAsCliError(err)
  }
}

async function resolveWalletAddress(
  actions: BaseContext['actions'],
  flags: BorrowPositionFlags,
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
  if (ens) return actions.ens.getAddress(requireEnsName(ens))
  throw new CliError('validation', 'One of --address or --ens is required')
}
