import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { resolveChain } from '@/resolvers/chains.js'

export interface SwapMarketsFlags {
  chain?: string
}

/**
 * @description Handler for `actions swap markets [--chain <name>]`.
 * Aggregates markets across every configured swap provider. The
 * optional `--chain` filter is forwarded to the SDK so it can prune
 * before iterating provider markets.
 * @param flags - Commander-parsed options; `--chain` optional.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runSwapMarkets(
  flags: SwapMarketsFlags = {},
): Promise<void> {
  const { actions, config } = baseContext()
  const chainId = flags.chain
    ? resolveChain(
        flags.chain,
        config.chains.map((c) => c.chainId),
      )
    : undefined
  try {
    const markets = await actions.swap.getMarkets(
      chainId ? { chainId } : undefined,
    )
    printOutput('swapMarkets', markets)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
