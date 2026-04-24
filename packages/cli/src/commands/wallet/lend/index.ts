import { Command } from 'commander'

import { runWalletLendClose } from '@/commands/wallet/lend/close.js'
import { runWalletLendOpen } from '@/commands/wallet/lend/open.js'
import { runWalletLendPosition } from '@/commands/wallet/lend/position.js'

/**
 * @description Builds the `wallet lend` subcommand tree. Children
 * resolve their market through the config allowlist and dispatch to
 * the matching `wallet.lend.*` method. Read-only `markets` and
 * `market` aliases live on the root `actions lend` tree to avoid
 * forcing PRIVATE_KEY for purely public reads.
 * @returns Commander `Command` configured with `open`, `close`, and `position`.
 */
export function lendCommand(): Command {
  const command = new Command('lend').description(
    'Open, close, and inspect lending positions on configured markets.',
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
  command
    .command('position')
    .description('Inspect the current lending position for the wallet.')
    .requiredOption(
      '--market <name>',
      'market name from the config allowlist (e.g. "Gauntlet USDC", "gauntlet-usdc")',
    )
    .action(runWalletLendPosition)
  return command
}
