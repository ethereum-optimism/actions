import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { requireEnsNameOrAddress, requireMainnet } from '@/resolvers/ens.js'

/**
 * @description Handler for `actions ens info <input>`. Fetches the standard ENS
 * profile text records (ENSIP-5 / ENSIP-18) for an ENS name or address via
 * `actions.ens.getInfo` and emits the SDK `EnsInfo` shape verbatim. Read-only,
 * no `PRIVATE_KEY` required. Requires mainnet to be configured
 * (`MAINNET_RPC_URL`); an input that is neither a name nor an address surfaces
 * as `validation`.
 * @param input - An ENS name or a 0x address positional argument.
 */
export async function runEnsInfo(input: string): Promise<void> {
  const { actions, config } = baseContext()
  requireMainnet(config)
  const resolved = requireEnsNameOrAddress(input)
  try {
    const info = await actions.ens.getInfo(resolved)
    printOutput('ensInfo', info)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
