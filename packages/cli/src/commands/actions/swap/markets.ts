import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { configuredAssets, resolveAsset } from '@/resolvers/assets.js'
import { resolveChain } from '@/resolvers/chains.js'

export interface SwapMarketsFlags {
  chain?: string
  asset?: string
}

/**
 * @description Handler for `actions swap markets [--chain <name>] [--asset <symbol>]`. Aggregates markets across every configured swap provider; optional `--chain` and `--asset` filters flow through to the SDK so it can prune before iterating provider markets.
 * @param flags - Commander-parsed options; both filters optional.
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
  const asset = flags.asset
    ? resolveAsset(flags.asset, configuredAssets(config))
    : undefined
  try {
    const markets = await actions.swap.getMarkets({ chainId, asset })
    printOutput('swapMarkets', markets)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
