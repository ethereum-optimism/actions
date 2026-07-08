import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import {
  configuredBorrowMarkets,
  resolveBorrowMarket,
} from '@/resolvers/borrowMarkets.js'
import { requireAddress } from '@/utils/addresses.js'

export interface BorrowPositionFlags {
  market: string
  wallet?: string
}

/**
 * @description Handler for `actions borrow position --market <name> --wallet <address>`.
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
    const walletAddress = requireAddress(flags.wallet ?? '', '--wallet')
    const position = await actions.borrow.getPosition({
      marketId: market,
      walletAddress,
    })
    printOutput('borrowPosition', position)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
