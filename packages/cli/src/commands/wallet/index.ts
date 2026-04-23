import { Command } from 'commander'

import { runWalletAddress } from '@/commands/wallet/address.js'
import { runWalletBalance } from '@/commands/wallet/balance.js'

/**
 * @description Builds the `wallet` subcommand tree. Registered children
 * are the wallet-scoped commands that require `PRIVATE_KEY`. PR 2/3 add
 * `wallet lend …` and `wallet swap …` under this command.
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
    .action(runWalletBalance)
  return command
}
