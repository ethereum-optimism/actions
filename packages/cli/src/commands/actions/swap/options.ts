import type { Command } from 'commander'

/**
 * @description Shared `[flag, description]` pairs for the swap quote-shaped commands. `actions swap quote/quotes` and `actions wallet swap execute` consume the same input contract; centralising the definitions keeps help text and flag names in lockstep.
 */
export const QUOTE_OPTIONS_HELP = {
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
  chain: ['--chain <name>', 'chain shortname (e.g. base-sepolia, op-sepolia)'],
  provider: [
    '--provider <name>',
    'force a provider: uniswap or velodrome (omit to let routing decide)',
  ],
  slippage: [
    '--slippage <pct>',
    'slippage tolerance as a percent (e.g. 0.5 for 0.5%)',
  ],
} as const

/**
 * @description Registers the quote-shaped flags on a commander subcommand. Used by `swap quote`, `swap quotes`, and `wallet swap execute`.
 */
export function addQuoteOptions(cmd: Command): Command {
  return cmd
    .requiredOption(...QUOTE_OPTIONS_HELP.in)
    .requiredOption(...QUOTE_OPTIONS_HELP.out)
    .option(...QUOTE_OPTIONS_HELP.amountIn)
    .option(...QUOTE_OPTIONS_HELP.amountOut)
    .requiredOption(...QUOTE_OPTIONS_HELP.chain)
    .option(...QUOTE_OPTIONS_HELP.provider)
    .option(...QUOTE_OPTIONS_HELP.slippage)
}
