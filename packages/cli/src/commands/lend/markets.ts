import { baseContext } from '@/context/baseContext.js'
import { CliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'

/**
 * @description Handler for `actions lend markets`. Aggregates
 * `getMarkets()` across every configured lend provider (Morpho + Aave).
 * Read-only, no signer needed. RPC failures surface as a retryable
 * `network` error since the SDK fans out under `Promise.all`.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runLendMarkets(): Promise<void> {
  const { actions } = baseContext()
  try {
    const markets = await actions.lend.getMarkets()
    printOutput('lendMarkets', markets)
  } catch (err) {
    if (err instanceof CliError) throw err
    throw new CliError(
      'network',
      err instanceof Error ? err.message : String(err),
      { cause: err },
    )
  }
}
