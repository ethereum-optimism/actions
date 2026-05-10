import { baseContext } from '@/context/baseContext.js'
import { type ChainRow, printOutput } from '@/output/printOutput.js'
import { shortnameFor } from '@/resolvers/chains.js'

/**
 * @description Handler for `actions chains`. Emits the configured chain
 * set: `chainId`, canonical `shortname`, and any explicit `rpcUrls`.
 * No SDK call; data comes from the resolved config.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runChains(): Promise<void> {
  const { config } = baseContext()
  const rows: ChainRow[] = config.chains.map((chain) => ({
    chainId: chain.chainId,
    shortname: shortnameFor(chain.chainId),
    rpcUrls: chain.rpcUrls,
  }))
  printOutput('chains', rows)
}
