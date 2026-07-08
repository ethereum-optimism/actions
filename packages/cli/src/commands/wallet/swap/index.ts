import { Command } from 'commander'

import { addQuoteOptions } from '@/commands/actions/swap/options.js'
import { runWalletSwapExecute } from '@/commands/wallet/swap/execute.js'
import { runWalletSwapQuote } from '@/commands/wallet/swap/quote.js'
import { runWalletSwapQuotes } from '@/commands/wallet/swap/quotes.js'

/**
 * @description Builds the `wallet swap` subcommand tree. Read-only `markets` and `market` live on the root `actions swap` tree (no `PRIVATE_KEY` needed). Wallet-scoped `quote` / `quotes` exist here too so the SDK defaults each quote's `recipient` to the wallet address, which is the safe path for routers that encode recipient into calldata (Velodrome v2/leaf). `execute` is the write path.
 * @returns Commander `Command` configured with `quote`, `quotes`, and `execute`.
 */
export function walletSwapCommand(): Command {
  const command = new Command('swap').description(
    'Wallet-scoped swap commands (require PRIVATE_KEY).',
  )
  addQuoteOptions(
    command
      .command('quote')
      .description('Get the best swap quote bound to the wallet as recipient.'),
  ).action(runWalletSwapQuote)
  addQuoteOptions(
    command
      .command('quotes')
      .description(
        'Get every available provider quote (best price first) bound to the wallet as recipient.',
      ),
  ).action(runWalletSwapQuotes)
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
    .option(
      '--deadline <unix>',
      'transaction deadline as a Unix timestamp in seconds (defaults to now + 60s)',
    )
    .action(runWalletSwapExecute)
  return command
}
