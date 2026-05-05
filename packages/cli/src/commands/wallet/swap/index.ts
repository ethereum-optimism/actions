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
  )
    .option(
      '--approval-mode <exact|max>',
      'ERC-20 approval strategy: "exact" approves only this swap (default, gas-heavier on repeat); "max" approves max-uint to amortise across future swaps',
    )
    .option(
      '--recipient <addr|ens>',
      'address or ENS name to receive the output tokens (defaults to the wallet address)',
    )
    .action(runWalletSwapExecute)
  return command
}
