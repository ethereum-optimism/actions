import { APPROVAL_MODES } from '@eth-optimism/actions-sdk'
import { Command } from 'commander'

import { runWalletLendClose } from '@/commands/wallet/lend/close.js'
import { runWalletLendOpen } from '@/commands/wallet/lend/open.js'
import { runWalletLendPosition } from '@/commands/wallet/lend/position.js'
import { runWalletLendPositions } from '@/commands/wallet/lend/positions.js'
import { CHAIN_EXAMPLES } from '@/resolvers/chains.js'

/**
 * @description Builds the `wallet lend` subcommand tree. Children resolve their market through the config allowlist and dispatch to the matching `wallet.lend.*` method. Read-only `markets` and `market` aliases live on the root `actions lend` tree to avoid forcing PRIVATE_KEY for purely public reads.
 * @returns Commander `Command` configured with `open`, `close`, and `position`.
 */
export function walletLendCommand(): Command {
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
    .option(
      `--approval-mode <${APPROVAL_MODES.join('|')}>`,
      'ERC-20 approval strategy: "exact" approves only this call (default, gas-heavier on repeat); "max" approves max-uint to amortise across future supplies',
    )
    .action(runWalletLendOpen)
  command
    .command('close')
    .description('Withdraw assets from a lending position.')
    .requiredOption(
      '--market <name>',
      'market name from the config allowlist (e.g. "Gauntlet USDC", "gauntlet-usdc")',
    )
    .option(
      '--amount <n>',
      'amount to withdraw in human-readable units (e.g. 10 for 10 USDC); mutually exclusive with --max',
    )
    .option(
      '--max',
      "withdraw the wallet's entire balance in this market (subject to inflight interest accrual; the CLI fetches the position first)",
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
  command
    .command('positions')
    .description(
      "Aggregate the wallet's positions across every configured market and provider in one call.",
    )
    .option(
      '--chain <shortnames>',
      `filter to one or more chains by shortname; comma-separated (e.g. ${CHAIN_EXAMPLES.shortname} or ${CHAIN_EXAMPLES.shortnameList}); mutually exclusive with --chain-id`,
    )
    .option(
      '--chain-id <ids>',
      `filter to one or more chains by numeric id; comma-separated (e.g. ${CHAIN_EXAMPLES.chainId} or ${CHAIN_EXAMPLES.chainIdList}); mutually exclusive with --chain`,
    )
    .option(
      '--non-zero-only',
      'drop zero-balance positions (default: return every configured market)',
    )
    .action(runWalletLendPositions)
  return command
}
