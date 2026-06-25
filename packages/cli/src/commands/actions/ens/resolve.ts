import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { requireEnsName, requireMainnet } from '@/resolvers/ens.js'

/**
 * @description Handler for `actions ens resolve <name>`. Forward-resolves an
 * ENS name to its address on mainnet via `actions.ens.getAddress` and emits
 * `{ name, address }`. Read-only, no `PRIVATE_KEY` required. Requires mainnet
 * to be configured (`MAINNET_RPC_URL`); a non-name input surfaces as
 * `validation` before the SDK is called.
 * @param name - The ENS name positional argument.
 */
export async function runEnsResolve(name: string): Promise<void> {
  const { actions, config } = baseContext()
  requireMainnet(config)
  const ensName = requireEnsName(name)
  try {
    const address = await actions.ens.getAddress(ensName)
    printOutput('ensResolve', { name: ensName, address })
  } catch (err) {
    rethrowAsCliError(err)
  }
}
