import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { configuredMarkets, resolveMarket } from '@/resolvers/markets.js'

/**
 * @description Handler for `actions lend market --market <name>`. Resolves the market name through the config allowlist, then calls `actions.lend.getMarket({address, chainId})` and emits the SDK shape verbatim. Read-only, no signer needed.
 */
export async function runLendMarket(flags: { market: string }): Promise<void> {
  const { actions, config } = baseContext()
  const market = resolveMarket(flags.market, configuredMarkets(config))
  try {
    const result = await actions.lend.getMarket({
      address: market.address,
      chainId: market.chainId,
    })
    printOutput('lendMarket', result)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
