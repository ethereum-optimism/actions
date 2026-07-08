import {
  buildSwapInputs,
  type QuoteFlags,
} from '@/commands/actions/swap/util.js'
import { walletContext } from '@/context/walletContext.js'
import { CliError, rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { configuredAssets } from '@/resolvers/assets.js'

/**
 * @description Handler for `actions wallet swap quote ...`. Same flag set as the read-only `actions swap quote`, but the SDK defaults the quote's `recipient` to the wallet address, which is the safe path for routers that encode recipient into calldata (Velodrome v2/leaf), so the resulting quote can be fed straight to `wallet swap execute`.
 * @param flags - Commander-parsed required + optional options.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runWalletSwapQuote(flags: QuoteFlags): Promise<void> {
  const { wallet, config } = await walletContext()
  if (!wallet.swap) {
    throw new CliError(
      'config',
      'Swap is not configured (no providers in config.swap)',
    )
  }
  const params = buildSwapInputs(
    flags,
    configuredAssets(config),
    config.chains.map((c) => c.chainId),
  )
  try {
    const quote = await wallet.swap.getQuote(params)
    printOutput('swapQuote', quote)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
