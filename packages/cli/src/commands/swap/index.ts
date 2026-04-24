import { Command } from 'commander'

import { runSwapMarket } from '@/commands/swap/market.js'
import { runSwapMarkets } from '@/commands/swap/markets.js'
import { runSwapQuote } from '@/commands/swap/quote.js'
import { runSwapQuotes } from '@/commands/swap/quotes.js'

const QUOTE_OPTIONS_HELP = {
  in: ['--in <symbol>', 'token to sell (e.g. USDC_DEMO)'],
  out: ['--out <symbol>', 'token to buy (e.g. OP_DEMO)'],
  amountIn: [
    '--amount-in <n>',
    'exact-in amount (mutually exclusive with --amount-out)',
  ],
  amountOut: [
    '--amount-out <n>',
    'exact-out amount (mutually exclusive with --amount-in)',
  ],
  chain: ['--chain <name>', 'chain shortname (e.g. unichain, op-sepolia)'],
  provider: [
    '--provider <name>',
    'force a provider: uniswap or velodrome (omit to let routing decide)',
  ],
  slippage: [
    '--slippage <pct>',
    'slippage tolerance as a percent (e.g. 0.5 for 0.5%)',
  ],
} as const

function addQuoteOptions(cmd: Command): Command {
  return cmd
    .requiredOption(...QUOTE_OPTIONS_HELP.in)
    .requiredOption(...QUOTE_OPTIONS_HELP.out)
    .option(...QUOTE_OPTIONS_HELP.amountIn)
    .option(...QUOTE_OPTIONS_HELP.amountOut)
    .requiredOption(...QUOTE_OPTIONS_HELP.chain)
    .option(...QUOTE_OPTIONS_HELP.provider)
    .option(...QUOTE_OPTIONS_HELP.slippage)
}

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
    .action(runSwapMarkets)
  command
    .command('market')
    .description('Inspect one swap market by pool id and chain.')
    .requiredOption('--pool <id>', 'pool identifier (keccak256 of PoolKey)')
    .requiredOption('--chain <name>', 'chain shortname (e.g. unichain)')
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
