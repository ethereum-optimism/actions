import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { requireAddress } from '@/utils/addresses.js'

/**
 * @description Handler for `actions ens name <address>`.
 * @param address - The address positional argument.
 * @returns Promise that resolves once stdout has been written.
 * @throws `CliError` with code `config`, `validation`, or `network`.
 */
export async function runEnsName(address: string): Promise<void> {
  const { actions } = baseContext()
  const addr = requireAddress(address)
  try {
    const name = await actions.ens.getName(addr)
    printOutput('ensName', { address: addr, name })
  } catch (err) {
    rethrowAsCliError(err)
  }
}
