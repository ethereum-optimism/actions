import { walletContext } from '@/context/walletContext.js'
import { CliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { resolveMarket } from '@/resolvers/markets.js'

import { rethrowAsCliError } from './util.js'

export interface LendPositionFlags {
  market: string
}

/**
 * @description Handler for `actions wallet lend position --market <name>`.
 * Resolves the market through the config allowlist and calls
 * `wallet.lend.getPosition({marketId})` to fetch the EOA's current
 * balance and shares in that market. Emits the SDK `LendMarketPosition`
 * shape verbatim (bigints stringified by the JSON sink).
 * @param flags - Commander-parsed required option.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runWalletLendPosition(
  flags: LendPositionFlags,
): Promise<void> {
  const { wallet, config } = await walletContext()
  if (!wallet.lend) {
    throw new CliError(
      'config',
      'Lending is not configured (no providers in config.lend)',
    )
  }
  const market = resolveMarket(flags.market, config)
  try {
    const position = await wallet.lend.getPosition({
      marketId: { address: market.address, chainId: market.chainId },
    })
    printOutput('lendPosition', position)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
