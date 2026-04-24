import { rethrowAsCliError } from '@/commands/wallet/lend/util.js'
import { baseContext } from '@/context/baseContext.js'
import { printOutput } from '@/output/printOutput.js'
import { resolveChain } from '@/resolvers/chains.js'

export interface SwapMarketFlags {
  pool: string
  chain: string
}

/**
 * @description Handler for `actions swap market --pool <id> --chain <name>`.
 * Resolves the chain shortname against the config, then queries every
 * provider in turn until one returns a matching market (the SDK
 * iterates internally). Read-only, no signer needed.
 * @param flags - Commander-parsed required options.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runSwapMarket(flags: SwapMarketFlags): Promise<void> {
  const { actions, config } = baseContext()
  const chainId = resolveChain(
    flags.chain,
    config.chains.map((c) => c.chainId),
  )
  try {
    const market = await actions.swap.getMarket({
      poolId: flags.pool,
      chainId,
    })
    printOutput('swapMarket', market)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
