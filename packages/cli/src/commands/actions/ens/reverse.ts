import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { requireAddress, requireMainnet } from '@/resolvers/ens.js'

/**
 * @description Handler for `actions ens reverse <address>`. Reverse-resolves an
 * address to its primary ENS name on mainnet via `actions.ens.getName` and
 * emits `{ address, name }`, with `name: null` when no primary record is set.
 * Read-only, no `PRIVATE_KEY` required. Requires mainnet to be configured
 * (`MAINNET_RPC_URL`); a non-address input surfaces as `validation`.
 * @param address - The address positional argument.
 */
export async function runEnsReverse(address: string): Promise<void> {
  const { actions, config } = baseContext()
  requireMainnet(config)
  const addr = requireAddress(address)
  try {
    const name = await actions.ens.getName(addr)
    printOutput('ensReverse', { address: addr, name })
  } catch (err) {
    rethrowAsCliError(err)
  }
}
