import { Command } from 'commander'

import { runEnsAddress } from '@/commands/actions/ens/address.js'
import { runEnsInfo } from '@/commands/actions/ens/info.js'
import { runEnsName } from '@/commands/actions/ens/name.js'

/**
 * @description Builds the read-only `ens` subcommand tree.
 * @returns Commander `Command` configured with `address`, `name`, `info`.
 */
export function ensCommand(): Command {
  const command = new Command('ens').description(
    'Read-only ENS commands on Ethereum mainnet (no PRIVATE_KEY required).',
  )
  command
    .command('address')
    .description('Resolve an ENS name to its address.')
    .argument('<name>', 'ENS name to resolve to an address (e.g. vitalik.eth)')
    .action(runEnsAddress)
  command
    .command('name')
    .description('Look up the primary ENS name for an address.')
    .argument('<address>', '0x-prefixed address to look up')
    .action(runEnsName)
  command
    .command('info')
    .description(
      'Fetch the standard ENS profile records for a name or address.',
    )
    .argument('<input>', 'ENS name or 0x-prefixed address')
    .action(runEnsInfo)
  return command
}
