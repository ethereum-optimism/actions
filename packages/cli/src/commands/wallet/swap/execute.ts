import { buildQuoteParams, type QuoteFlags } from '@/commands/swap/util.js'
import {
  ensureOnchainSuccess,
  rethrowAsCliError,
  toReceiptArray,
} from '@/commands/wallet/lend/util.js'
import { walletContext } from '@/context/walletContext.js'
import { CliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'

/**
 * @description Handler for `actions wallet swap execute --in <symbol>
 * --out <symbol> (--amount-in <n> | --amount-out <n>) --chain <name>
 * [--slippage <pct>] [--provider uniswap|velodrome]`. Builds a
 * `WalletSwapParams` from CLI flags and delegates to
 * `wallet.swap.execute`, which re-quotes, dispatches Permit2 / token
 * approval + swap as a sendBatch, and waits for receipts. The CLI
 * normalises the union receipt type to an array, surfaces reverts as
 * `onchain` (exit 5), and emits a structured envelope.
 * @param flags - Commander-parsed required + optional options.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runWalletSwapExecute(flags: QuoteFlags): Promise<void> {
  const { wallet, config } = await walletContext()
  if (!wallet.swap) {
    throw new CliError(
      'config',
      'Swap is not configured (no providers in config.swap)',
    )
  }
  const params = buildQuoteParams(
    flags,
    config.assets?.allow ?? [],
    config.chains.map((c) => c.chainId),
  )
  try {
    const result = await wallet.swap.execute(params)
    const receipts = toReceiptArray(result.receipt)
    ensureOnchainSuccess(receipts)
    printOutput('swapExecute', {
      action: 'execute',
      assetIn: { symbol: result.assetIn.metadata.symbol },
      assetOut: { symbol: result.assetOut.metadata.symbol },
      amountIn: result.amountIn,
      amountOut: result.amountOut,
      amountInRaw: result.amountInRaw,
      amountOutRaw: result.amountOutRaw,
      price: result.price,
      priceImpact: result.priceImpact,
      transactions: receipts,
    })
  } catch (err) {
    rethrowAsCliError(err)
  }
}
