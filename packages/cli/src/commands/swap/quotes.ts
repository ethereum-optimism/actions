import { buildQuoteParams, type QuoteFlags } from '@/commands/swap/util.js'
import { rethrowAsCliError } from '@/commands/wallet/lend/util.js'
import { baseContext } from '@/context/baseContext.js'
import { printOutput } from '@/output/printOutput.js'

/**
 * @description Handler for `actions swap quotes ...`. Same flag set as
 * `swap quote` but returns every successful provider quote sorted by
 * `amountOutRaw` desc (best price first). When `--provider` is set the
 * SDK still returns a one-element array so the caller can branch
 * uniformly.
 * @param flags - Commander-parsed required + optional options.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runSwapQuotes(flags: QuoteFlags): Promise<void> {
  const { actions, config } = baseContext()
  const params = buildQuoteParams(
    flags,
    config.assets?.allow ?? [],
    config.chains.map((c) => c.chainId),
  )
  try {
    const quotes = await actions.swap.getQuotes(params)
    printOutput('swapQuotes', quotes)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
