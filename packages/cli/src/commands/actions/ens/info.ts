import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { requireEnsNameOrAddress } from '@/resolvers/ens.js'

/**
 * @description Handler for `actions ens info <input>`.
 * @param input - An ENS name or a 0x address positional argument.
 * @returns Promise that resolves once stdout has been written.
 * @throws `CliError` with code `config`, `validation`, or `network`.
 */
export async function runEnsInfo(input: string): Promise<void> {
  const { actions } = baseContext()
  const resolved = requireEnsNameOrAddress(input)
  try {
    const info = await actions.ens.getInfo(resolved)
    printOutput('ensInfo', info)
  } catch (err) {
    rethrowAsCliError(err)
  }
}
