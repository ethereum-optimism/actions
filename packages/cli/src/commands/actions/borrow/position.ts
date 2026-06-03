import { getAddress, isAddress } from 'viem'

import { baseContext } from '@/context/baseContext.js'
import { CliError, rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import {
  configuredBorrowMarkets,
  resolveBorrowMarket,
} from '@/resolvers/borrowMarkets.js'

export interface BorrowPositionFlags {
  market: string
  wallet: string
}

/**
 * @description Handler for `actions borrow position --market <name> --wallet <address>`. Lets an operator inspect any wallet's borrow position without needing `PRIVATE_KEY`. Validates the address with viem's `isAddress` and forwards the checksummed form to the SDK so case-only typos surface as `validation` rather than a downstream RPC mismatch. Unlike lend, the SDK exposes `getPosition` on the base namespace and requires an explicit `walletAddress`.
 * @param flags - Commander-parsed options.
 */
export async function runBorrowPosition(
  flags: BorrowPositionFlags,
): Promise<void> {
  const { actions, config } = baseContext()
  const market = resolveBorrowMarket(
    flags.market,
    configuredBorrowMarkets(config),
  )
  if (!isAddress(flags.wallet)) {
    throw new CliError(
      'validation',
      `Invalid --wallet: ${flags.wallet} (expected a 0x-prefixed 20-byte address)`,
      { wallet: flags.wallet },
    )
  }
  const walletAddress = getAddress(flags.wallet)
  try {
    const position = await actions.borrow.getPosition({
      marketId: market,
      walletAddress,
    })
    printOutput('borrowPosition', position)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
