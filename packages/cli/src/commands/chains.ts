import { baseContext } from '@/context/baseContext.js'
import { writeJson } from '@/output/json.js'
import { shortnameFor } from '@/resolvers/chains.js'

/**
 * @description Handler for `actions chains`. Emits the configured chain
 * set as JSON - each entry carries `chainId`, canonical `shortname`, and
 * any explicit `rpcUrls`. No SDK call; the data comes from the resolved
 * config and the chain resolver's inverse map.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runChains(): Promise<void> {
  const { config } = baseContext()
  writeJson(
    config.chains.map((chain) => ({
      chainId: chain.chainId,
      shortname: shortnameFor(chain.chainId),
      rpcUrls: chain.rpcUrls,
    })),
  )
}
