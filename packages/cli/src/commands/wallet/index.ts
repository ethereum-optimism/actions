import { Command } from 'commander'

import { runWalletAddress } from '@/commands/wallet/address.js'
import { runWalletBalance } from '@/commands/wallet/balance.js'
import { lendCommand } from '@/commands/wallet/lend/index.js'

/**
 * @description Builds the `wallet` subcommand tree. Registered children
 * are the wallet-scoped commands that require `PRIVATE_KEY`.
 * @returns Commander `Command` configured with its subcommands.
 */
export function walletCommand(): Command {
  const command = new Command('wallet').description(
    'Wallet-scoped commands (require PRIVATE_KEY).',
  )
  command
    .command('address')
    .description('Print the EOA address derived from PRIVATE_KEY.')
    .action(runWalletAddress)
  command
    .command('balance')
    .description('Print ETH and ERC-20 balances across every configured chain.')
    .option(
      '--chain <shortname>',
      'filter to one chain by shortname (e.g. base-sepolia); mutually exclusive with --chain-id',
    )
    .option(
      '--chain-id <id>',
      'filter to one chain by numeric id (e.g. 84532); mutually exclusive with --chain',
    )
    .action(runWalletBalance)
  command.addCommand(lendCommand())
  return command
}
