import { Command } from 'commander'

import { runSwapMarket } from '@/commands/actions/swap/market.js'
import { runSwapMarkets } from '@/commands/actions/swap/markets.js'
import { addQuoteOptions } from '@/commands/actions/swap/options.js'
import { runSwapQuote } from '@/commands/actions/swap/quote.js'
import { runSwapQuotes } from '@/commands/actions/swap/quotes.js'

/**
 * @description Builds the root `swap` subcommand tree. Children read
 * markets and price quotes with no signer; wallet-scoped execution
 * lives under `wallet swap`.
 * @returns Commander `Command` configured with `markets`, `market`,
 * `quote`, and `quotes`.
 */
export function swapCommand(): Command {
  const command = new Command('swap').description(
    'Read-only swap market + quote commands (no PRIVATE_KEY required).',
  )
  command
    .command('markets')
    .description('List swap markets across configured providers.')
    .option('--chain <name>', 'filter to a single chain by shortname')
    .option(
      '--asset <symbol>',
      'filter to markets containing this asset (e.g. USDC_DEMO). Case-insensitive.',
    )
    .action(runSwapMarkets)
  command
    .command('market')
    .description('Inspect one swap market by pool id and chain.')
    .requiredOption('--pool <id>', 'pool identifier (keccak256 of PoolKey)')
    .requiredOption('--chain <name>', 'chain shortname (e.g. base-sepolia)')
    .action(runSwapMarket)
  addQuoteOptions(
    command.command('quote').description('Get the best swap quote.'),
  ).action(runSwapQuote)
  addQuoteOptions(
    command
      .command('quotes')
      .description('Get every available provider quote, best price first.'),
  ).action(runSwapQuotes)
  return command
}
