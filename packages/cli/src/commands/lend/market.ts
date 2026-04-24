import { rethrowAsCliError } from '@/commands/wallet/lend/util.js'
import { baseContext } from '@/context/baseContext.js'
import { printOutput } from '@/output/printOutput.js'
import { resolveMarket } from '@/resolvers/markets.js'

export interface LendMarketFlags {
  market: string
}

/**
 * @description Handler for `actions lend market --market <name>`.
 * Resolves the market name through the config allowlist, then calls
 * `actions.lend.getMarket({address, chainId})` and emits the SDK shape
 * verbatim. Read-only, no signer needed.
 * @param flags - Commander-parsed required option.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runLendMarket(flags: LendMarketFlags): Promise<void> {
  const { actions, config } = baseContext()
  const market = resolveMarket(flags.market, config)
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
