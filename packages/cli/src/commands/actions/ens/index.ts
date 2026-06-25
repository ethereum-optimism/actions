import { Command } from 'commander'

import { runEnsInfo } from '@/commands/actions/ens/info.js'
import { runEnsResolve } from '@/commands/actions/ens/resolve.js'
import { runEnsReverse } from '@/commands/actions/ens/reverse.js'

/**
 * @description Builds the root `ens` subcommand tree. All children are
 * read-only ENS reads on Ethereum mainnet and need no signer. Mainnet must be
 * configured via `MAINNET_RPC_URL`; otherwise each command exits `config` (3).
 * @returns Commander `Command` configured with `resolve`, `reverse`, `info`.
 */
export function ensCommand(): Command {
  const command = new Command('ens').description(
    'Read-only ENS commands on Ethereum mainnet (no PRIVATE_KEY required; requires MAINNET_RPC_URL).',
  )
  command
    .command('resolve')
    .description('Resolve an ENS name to its address.')
    .argument('<name>', 'ENS name to resolve (e.g. vitalik.eth)')
    .action(runEnsResolve)
  command
    .command('reverse')
    .description('Reverse-resolve an address to its primary ENS name.')
    .argument('<address>', '0x-prefixed address to reverse-resolve')
    .action(runEnsReverse)
  command
    .command('info')
    .description(
      'Fetch the standard ENS profile records for a name or address.',
    )
    .argument('<input>', 'ENS name or 0x-prefixed address')
    .action(runEnsInfo)
  return command
}
