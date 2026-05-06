import { Command } from 'commander'

import { runWalletAddress } from '@/commands/wallet/address.js'
import { runWalletBalance } from '@/commands/wallet/balance.js'
import { walletLendCommand } from '@/commands/wallet/lend/index.js'
import { walletSwapCommand } from '@/commands/wallet/swap/index.js'
import { loadConfig } from '@/config/loadConfig.js'
import { shortnameFor } from '@/resolvers/chains.js'

/**
 * @description Builds the `wallet` subcommand tree. Registered children
 * are the wallet-scoped commands that require `PRIVATE_KEY`.
 * @returns Commander `Command` configured with its subcommands.
 */
export function walletCommand(): Command {
  const config = loadConfig()
  const ids = config.chains.map((c) => c.chainId).slice(0, 2)
  const firstShortname = ids[0] ? shortnameFor(ids[0]) : 'base-sepolia'
  const secondShortname = ids[1] ? shortnameFor(ids[1]) : 'op-sepolia'
  const shortnameList =
    ids.length > 1 ? `${firstShortname},${secondShortname}` : firstShortname
  const firstId = ids[0]?.toString() ?? '84532'
  const secondId = ids[1]?.toString() ?? '11155420'
  const idList = ids.length > 1 ? `${firstId},${secondId}` : firstId
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
      '--chain <shortnames>',
      `filter to one or more chains by shortname; comma-separated (e.g. ${firstShortname} or ${shortnameList}); mutually exclusive with --chain-id`,
    )
    .option(
      '--chain-id <ids>',
      `filter to one or more chains by numeric id; comma-separated (e.g. ${firstId} or ${idList}); mutually exclusive with --chain`,
    )
    .action(runWalletBalance)
  command.addCommand(walletLendCommand())
  command.addCommand(walletSwapCommand())
  return command
}
