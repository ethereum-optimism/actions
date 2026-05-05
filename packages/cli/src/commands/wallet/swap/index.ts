import { Command } from 'commander'

import { addQuoteOptions } from '@/commands/actions/swap/options.js'
import { runWalletSwapExecute } from '@/commands/wallet/swap/execute.js'

/**
 * @description Builds the `wallet swap` subcommand tree. Read-only `markets`, `market`, `quote`, `quotes` aliases live on the root `actions swap` tree to avoid forcing PRIVATE_KEY for purely public reads. The wallet tree exposes only `execute`.
 * @returns Commander `Command` configured with `execute`.
 */
export function walletSwapCommand(): Command {
  const command = new Command('swap').description(
    'Execute swaps from the EOA derived from PRIVATE_KEY.',
  )
  addQuoteOptions(
    command
      .command('execute')
      .description('Execute a swap on a configured chain.'),
  ).action(runWalletSwapExecute)
  return command
}
