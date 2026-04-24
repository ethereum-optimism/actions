import { buildQuoteParams, type QuoteFlags } from '@/commands/swap/util.js'
import { rethrowAsCliError } from '@/commands/wallet/lend/util.js'
import { baseContext } from '@/context/baseContext.js'
import { printOutput } from '@/output/printOutput.js'

/**
 * @description Handler for
 * `actions swap quote --in <symbol> --out <symbol>
 * (--amount-in <n> | --amount-out <n>) --chain <name>
 * [--provider uniswap|velodrome] [--slippage <pct>]`.
 * Returns one `SwapQuote` (best price by default; explicit `--provider`
 * skips routing). Read-only.
 * @param flags - Commander-parsed required + optional options.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runSwapQuote(flags: QuoteFlags): Promise<void> {
  const { actions, config } = baseContext()
  const params = buildQuoteParams(
    flags,
    config.assets?.allow ?? [],
    config.chains.map((c) => c.chainId),
  )
  try {
    const quote = await actions.swap.getQuote(params)
    printOutput('swapQuote', quote)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
