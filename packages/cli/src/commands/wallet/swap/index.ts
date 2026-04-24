import { Command } from 'commander'

import { runWalletSwapExecute } from '@/commands/wallet/swap/execute.js'

/**
 * @description Builds the `wallet swap` subcommand tree. Read-only
 * `markets`, `market`, `quote`, `quotes` aliases live on the root
 * `actions swap` tree to avoid forcing PRIVATE_KEY for purely public
 * reads. The wallet tree exposes only `execute`.
 * @returns Commander `Command` configured with `execute`.
 */
export function swapCommand(): Command {
  const command = new Command('swap').description(
    'Execute swaps from the EOA derived from PRIVATE_KEY.',
  )
  command
    .command('execute')
    .description('Execute a swap on a configured chain.')
    .requiredOption('--in <symbol>', 'token to sell (e.g. USDC_DEMO)')
    .requiredOption('--out <symbol>', 'token to buy (e.g. OP_DEMO)')
    .option(
      '--amount-in <n>',
      'exact-in amount (mutually exclusive with --amount-out)',
    )
    .option(
      '--amount-out <n>',
      'exact-out amount (mutually exclusive with --amount-in)',
    )
    .requiredOption(
      '--chain <name>',
      'chain shortname (e.g. unichain, op-sepolia)',
    )
    .option(
      '--provider <name>',
      'force a provider: uniswap or velodrome (omit to let routing decide)',
    )
    .option(
      '--slippage <pct>',
      'slippage tolerance as a percent (e.g. 0.5 for 0.5%)',
    )
    .action(runWalletSwapExecute)
  return command
}
