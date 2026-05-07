import { Command } from 'commander'

import { runLendMarket } from '@/commands/actions/lend/market.js'
import { runLendMarkets } from '@/commands/actions/lend/markets.js'
import { loadConfig } from '@/config/loadConfig.js'
import { configuredAssets } from '@/resolvers/assets.js'
import { CHAIN_EXAMPLES } from '@/resolvers/chains.js'

/**
 * @description Builds the root `lend` subcommand tree. Children read
 * lending data with no signer; wallet-scoped operations live under
 * `wallet lend`. Provider routing happens inside the SDK based on the
 * resolved market.
 * @returns Commander `Command` configured with `markets` and `market`.
 */
export function lendCommand(): Command {
  const assetExample =
    configuredAssets(loadConfig())[0]?.metadata.symbol ?? 'USDC'
  const command = new Command('lend').description(
    'Read-only lending market commands (no PRIVATE_KEY required).',
  )
  command
    .command('markets')
    .description('List all lending markets across configured providers.')
    .option(
      '--asset <symbol>',
      `filter to markets denominated in one asset (e.g. ${assetExample}). Case-insensitive.`,
    )
    .option(
      '--chain <shortname>',
      `filter to markets on one chain by shortname (e.g. ${CHAIN_EXAMPLES.shortname}); mutually exclusive with --chain-id`,
    )
    .option(
      '--chain-id <id>',
      `filter to markets on one chain by numeric id (e.g. ${CHAIN_EXAMPLES.chainId}); mutually exclusive with --chain`,
    )
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
