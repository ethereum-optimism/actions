import { walletContext } from '@/context/walletContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import {
  configuredBorrowMarkets,
  resolveBorrowMarket,
} from '@/resolvers/borrowMarkets.js'

import { requireBorrowCapability } from './requireBorrowCapability.js'

/**
 * @description Handler for `actions wallet borrow position --market <name>`. Resolves the market through the config allowlist and reads the connected wallet's position. Unlike `actions borrow position`, no `--wallet` flag is required: the wallet's address comes from the loaded `PRIVATE_KEY`. The SDK's `getPosition` lives on the base namespace and takes both `marketId` and `walletAddress`, so the handler still has to forward them both.
 * @param flags - Commander-parsed required options.
 */
export async function runWalletBorrowPosition(flags: {
  market: string
}): Promise<void> {
  const { wallet, actions, config } = await walletContext()
  requireBorrowCapability(wallet)
  const market = resolveBorrowMarket(
    flags.market,
    configuredBorrowMarkets(config),
  )
  try {
    const position = await actions.borrow.getPosition({
      marketId: market,
      walletAddress: wallet.address,
    })
    printOutput('borrowPosition', position)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
