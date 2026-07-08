import { Command } from 'commander'

import { runBorrowMarket } from '@/commands/actions/borrow/market.js'
import { runBorrowMarkets } from '@/commands/actions/borrow/markets.js'
import { runBorrowPosition } from '@/commands/actions/borrow/position.js'
import { loadConfig } from '@/config/loadConfig.js'
import { configuredAssets } from '@/resolvers/assets.js'
import { CHAIN_EXAMPLES } from '@/resolvers/chains.js'

/**
 * @description Builds the root `borrow` subcommand tree. Children read borrow data with no signer; wallet-scoped operations live under `wallet borrow`. Provider routing happens inside the SDK based on the resolved market.
 * @returns Commander `Command` configured with `markets`, `market`, and `position`.
 */
export function borrowCommand(): Command {
  const assetExample =
    configuredAssets(loadConfig())[0]?.metadata.symbol ?? 'USDC'
  const command = new Command('borrow').description(
    'Read-only borrow market commands (no PRIVATE_KEY required).',
  )
  command
    .command('markets')
    .description('List all borrow markets across configured providers.')
    .option(
      '--collateral <symbol>',
      `filter to markets that accept this collateral asset (e.g. ${assetExample}). Case-insensitive.`,
    )
    .option(
      '--borrow-asset <symbol>',
      'filter to markets that borrow this asset. Case-insensitive.',
    )
    .option(
      '--chain <shortname>',
      `filter to markets on one chain by shortname (e.g. ${CHAIN_EXAMPLES.shortname}); mutually exclusive with --chain-id`,
    )
    .option(
      '--chain-id <id>',
      `filter to markets on one chain by numeric id (e.g. ${CHAIN_EXAMPLES.chainId}); mutually exclusive with --chain`,
    )
    .addHelpText(
      'after',
      '\nExample:\n  actions borrow markets --collateral USDC_DEMO --chain base-sepolia',
    )
    .action(runBorrowMarkets)
  command
    .command('market')
    .description('Inspect one borrow market by name.')
    .requiredOption(
      '--market <name>',
      'market name from the config allowlist (e.g. "Demo dUSDC / OP", "demo-dusdc-op")',
    )
    .addHelpText(
      'after',
      '\nExample:\n  actions borrow market --market demo-dusdc-op',
    )
    .action(runBorrowMarket)
  command
    .command('position')
    .description(
      "Inspect any wallet's borrow position on a configured market (read-only, requires --wallet).",
    )
    .requiredOption(
      '--market <name>',
      'market name from the config allowlist (e.g. "Demo dUSDC / OP", "demo-dusdc-op")',
    )
    .requiredOption(
      '--wallet <address>',
      '0x-prefixed wallet address to inspect',
    )
    .addHelpText(
      'after',
      '\nExample:\n  actions borrow position --market demo-dusdc-op --wallet 0xabc...',
    )
    .action(runBorrowPosition)
  return command
}
