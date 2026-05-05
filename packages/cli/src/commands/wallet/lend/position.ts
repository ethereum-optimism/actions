import { walletContext } from '@/context/walletContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { collectMarkets, resolveMarket } from '@/resolvers/markets.js'

import { requireLendCapability } from './requireLendCapability.js'

/**
 * @description Handler for `actions wallet lend position --market <name>`. Resolves the market through the config allowlist and calls `wallet.lend.getPosition({marketId})` to fetch the EOA's current balance and shares in that market. Emits the SDK `LendMarketPosition` shape verbatim (bigints stringified by the JSON sink).
 */
export async function runWalletLendPosition(flags: {
  market: string
}): Promise<void> {
  const { wallet, config } = await walletContext()
  requireLendCapability(wallet)
  const market = resolveMarket(flags.market, collectMarkets(config))
  try {
    const position = await wallet.lend.getPosition({
      marketId: { address: market.address, chainId: market.chainId },
    })
    printOutput('lendPosition', position)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
