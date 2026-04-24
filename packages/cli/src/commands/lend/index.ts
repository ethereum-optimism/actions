import { Command } from 'commander'

import { runLendMarket } from '@/commands/lend/market.js'
import { runLendMarkets } from '@/commands/lend/markets.js'

/**
 * @description Builds the root `lend` subcommand tree. Children read
 * lending data with no signer; wallet-scoped operations live under
 * `wallet lend`. Provider routing happens inside the SDK based on the
 * resolved market.
 * @returns Commander `Command` configured with `markets` and `market`.
 */
export function lendCommand(): Command {
  const command = new Command('lend').description(
    'Read-only lending market commands (no PRIVATE_KEY required).',
  )
  command
    .command('markets')
    .description('List all lending markets across configured providers.')
    .action(runLendMarkets)
  command
    .command('market')
    .description('Inspect one lending market by name.')
    .requiredOption(
      '--market <name>',
      'market name from the config allowlist (e.g. "Gauntlet USDC", "gauntlet-usdc")',
    )
    .action(runLendMarket)
  return command
}
