import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { requireEnsName } from '@/resolvers/ens.js'

/**
 * @description Handler for `actions ens address <name>`.
 * @param name - The ENS name positional argument.
 * @returns Promise that resolves once stdout has been written.
 * @throws `CliError` with code `config`, `validation`, or `network`.
 */
export async function runEnsAddress(name: string): Promise<void> {
  const { actions } = baseContext()
  const ensName = requireEnsName(name)
  try {
    const address = await actions.ens.getAddress(ensName)
    printOutput('ensAddress', { name: ensName, address })
  } catch (err) {
    rethrowAsCliError(err)
  }
}
