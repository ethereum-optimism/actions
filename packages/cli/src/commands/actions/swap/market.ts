import { parseProvider } from '@/commands/actions/swap/util.js'
import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { resolveChain } from '@/resolvers/chains.js'

export interface SwapMarketFlags {
  pool: string
  chain: string
  provider?: string
}

/**
 * @description Handler for `actions swap market --pool <id> --chain <name> [--provider <name>]`. Resolves the chain shortname against the config, then queries the named provider directly (or every provider in turn until one returns a matching market when `--provider` is omitted). Read-only, no signer needed.
 * @param flags - Commander-parsed required options + optional provider.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runSwapMarket(flags: SwapMarketFlags): Promise<void> {
  const { actions, config } = baseContext()
  const chainId = resolveChain(
    flags.chain,
    config.chains.map((c) => c.chainId),
  )
  const provider = parseProvider(flags.provider)
  try {
    const market = await actions.swap.getMarket(
      { poolId: flags.pool, chainId },
      provider,
    )
    printOutput('swapMarket', market)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
