import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import {
  configuredBorrowMarkets,
  resolveBorrowMarket,
} from '@/resolvers/borrowMarkets.js'

/**
 * @description Handler for `actions borrow market --market <name>`. Resolves the market name through the config allowlist and calls `actions.borrow.getMarket(market)` (the full `BorrowMarketConfig` is structurally a `BorrowMarketId`, so passing the resolved config carries the `kind` discriminant without rebuilding a literal). Read-only, no signer needed.
 */
export async function runBorrowMarket(flags: {
  market: string
}): Promise<void> {
  const { actions, config } = baseContext()
  const market = resolveBorrowMarket(
    flags.market,
    configuredBorrowMarkets(config),
  )
  try {
    const result = await actions.borrow.getMarket(market)
    printOutput('borrowMarket', result)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
