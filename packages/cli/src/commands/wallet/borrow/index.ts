import { APPROVAL_MODES } from '@eth-optimism/actions-sdk'
import { Command } from 'commander'

import { runWalletBorrowClose } from '@/commands/wallet/borrow/close.js'
import { runWalletBorrowDepositCollateral } from '@/commands/wallet/borrow/deposit-collateral.js'
import { runWalletBorrowOpen } from '@/commands/wallet/borrow/open.js'
import { runWalletBorrowPosition } from '@/commands/wallet/borrow/position.js'
import { runWalletBorrowRepay } from '@/commands/wallet/borrow/repay.js'
import { runWalletBorrowWithdrawCollateral } from '@/commands/wallet/borrow/withdraw-collateral.js'

const MARKET_DESC =
  'market name from the config allowlist (e.g. "Demo dUSDC / OP", "demo-dusdc-op")'

/**
 * @description Builds the `wallet borrow` subcommand tree. Children resolve their market through the config allowlist and dispatch to the matching `wallet.borrow.*` method. Read-only `markets` / `market` / `position` aliases live on the root `actions borrow` tree so they don't force `PRIVATE_KEY` on operators who only want to read.
 * @returns Commander `Command` configured with `open`, `close`, `deposit-collateral`, `withdraw-collateral`, `repay`, and `position`.
 */
export function walletBorrowCommand(): Command {
  const command = new Command('borrow').description(
    'Open, close, adjust, and inspect borrow positions on configured markets.',
  )
  command
    .command('open')
    .description('Borrow against collateral on a borrow market.')
    .requiredOption('--market <name>', MARKET_DESC)
    .requiredOption(
      '--borrow-amount <n>',
      'amount to borrow in human-readable units (e.g. 100 for 100 OP)',
    )
    .option(
      '--collateral-amount <n>',
      'collateral to deposit alongside the borrow; omit to borrow against previously deposited collateral',
    )
    .option(
      `--approval-mode <${APPROVAL_MODES.join('|')}>`,
      'ERC-20 approval strategy: "exact" approves only this call (default, gas-heavier on repeat); "max" approves max-uint to amortise across future top-ups',
    )
    .addHelpText(
      'after',
      '\nExample:\n  actions wallet borrow open --market demo-dusdc-op --borrow-amount 1 --collateral-amount 2',
    )
    .action(runWalletBorrowOpen)
  command
    .command('close')
    .description(
      'Unwind a borrow position: repay debt and optionally withdraw collateral.',
    )
    .requiredOption('--market <name>', MARKET_DESC)
    .option(
      '--borrow-amount <n>',
      'debt to repay in human-readable units; mutually exclusive with --borrow-max',
    )
    .option(
      '--borrow-max',
      "repay the wallet's entire debt in this market (resolves on-chain at dispatch time to avoid interest-accrual dust); mutually exclusive with --borrow-amount",
    )
    .option(
      '--collateral-amount <n>',
      'collateral to withdraw in human-readable units; omit to leave collateral on the position; mutually exclusive with --collateral-max',
    )
    .option(
      '--collateral-max',
      "withdraw the wallet's entire collateral in this market; mutually exclusive with --collateral-amount",
    )
    .addHelpText(
      'after',
      '\nExample:\n  actions wallet borrow close --market demo-dusdc-op --borrow-max --collateral-max',
    )
    .action(runWalletBorrowClose)
  command
    .command('deposit-collateral')
    .description(
      'Deposit additional collateral without changing the debt side.',
    )
    .requiredOption('--market <name>', MARKET_DESC)
    .requiredOption(
      '--amount <n>',
      'collateral to deposit in human-readable units (e.g. 5 for 5 USDC)',
    )
    .option(
      `--approval-mode <${APPROVAL_MODES.join('|')}>`,
      'ERC-20 approval strategy: "exact" approves only this call (default); "max" approves max-uint to amortise across future deposits',
    )
    .addHelpText(
      'after',
      '\nExample:\n  actions wallet borrow deposit-collateral --market demo-dusdc-op --amount 5',
    )
    .action(runWalletBorrowDepositCollateral)
  command
    .command('withdraw-collateral')
    .description('Withdraw collateral without touching the debt side.')
    .requiredOption('--market <name>', MARKET_DESC)
    .option(
      '--amount <n>',
      'collateral to withdraw in human-readable units; mutually exclusive with --max',
    )
    .option(
      '--max',
      "withdraw the wallet's entire collateral (resolves on-chain at dispatch time); mutually exclusive with --amount",
    )
    .addHelpText(
      'after',
      '\nExample:\n  actions wallet borrow withdraw-collateral --market demo-dusdc-op --amount 1',
    )
    .action(runWalletBorrowWithdrawCollateral)
  command
    .command('repay')
    .description('Repay outstanding debt without touching collateral.')
    .requiredOption('--market <name>', MARKET_DESC)
    .option(
      '--amount <n>',
      'debt to repay in human-readable units; mutually exclusive with --max',
    )
    .option(
      '--max',
      'repay the entire outstanding debt (resolves on-chain at dispatch time, avoiding interest-accrual dust); mutually exclusive with --amount',
    )
    .option(
      `--approval-mode <${APPROVAL_MODES.join('|')}>`,
      'ERC-20 approval strategy for the repay token: "exact" approves only this call; "max" amortises across future repays',
    )
    .addHelpText(
      'after',
      '\nExample:\n  actions wallet borrow repay --market demo-dusdc-op --max',
    )
    .action(runWalletBorrowRepay)
  command
    .command('position')
    .description('Inspect the current borrow position for the wallet.')
    .requiredOption('--market <name>', MARKET_DESC)
    .addHelpText(
      'after',
      '\nExample:\n  actions wallet borrow position --market demo-dusdc-op',
    )
    .action(runWalletBorrowPosition)
  return command
}
