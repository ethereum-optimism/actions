import { Command } from 'commander'

import { runWalletLendClose } from '@/commands/wallet/lend/close.js'
import { runWalletLendOpen } from '@/commands/wallet/lend/open.js'

/**
 * @description Builds the `wallet lend` subcommand tree. Each child
 * resolves its market through the config allowlist and dispatches to
 * `wallet.lend.{openPosition,closePosition}`. Read-only siblings
 * (`markets`, `market`, `position`) are deferred to a follow-up.
 * @returns Commander `Command` configured with `open` and `close`.
 */
export function lendCommand(): Command {
  const command = new Command('lend').description(
    'Open and close lending positions on configured markets.',
  )
  command
    .command('open')
    .description('Supply assets to a lending market.')
    .requiredOption(
      '--market <name>',
      'market name from the config allowlist (e.g. "Gauntlet USDC", "gauntlet-usdc")',
    )
    .requiredOption(
      '--amount <n>',
      'amount to supply in human-readable units (e.g. 10 for 10 USDC)',
    )
    .action(runWalletLendOpen)
  command
    .command('close')
    .description('Withdraw assets from a lending position.')
    .requiredOption(
      '--market <name>',
      'market name from the config allowlist (e.g. "Gauntlet USDC", "gauntlet-usdc")',
    )
    .requiredOption(
      '--amount <n>',
      'amount to withdraw in human-readable units (e.g. 10 for 10 USDC)',
    )
    .action(runWalletLendClose)
  return command
}
