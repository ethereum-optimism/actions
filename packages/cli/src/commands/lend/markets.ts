import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'

/**
 * @description Handler for `actions lend markets`. Aggregates `getMarkets()` across every configured lend provider (Morpho + Aave). Read-only, no signer needed. Errors surface through `rethrowAsCliError`, which maps SDK `ActionsError` subclasses to `validation`/`config` envelopes and unrecognised throws to retryable `network`.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runLendMarkets(): Promise<void> {
  const { actions } = baseContext()
  try {
    const markets = await actions.lend.getMarkets()
    printOutput('lendMarkets', markets)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
