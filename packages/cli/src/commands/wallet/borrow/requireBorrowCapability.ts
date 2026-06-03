import type { Wallet } from '@eth-optimism/actions-sdk'

import { CliError } from '@/output/errors.js'

/**
 * @description Asserts that a `Wallet` has the borrow namespace configured. Defers the runtime check to `Wallet.has('borrow')` and narrows `wallet.borrow` to non-null on the caller side so each handler can reach `wallet.borrow.openPosition` etc. without re-checking. Throws `CliError('config')` when no borrow providers are configured (`ActionsConfig.borrow` was omitted or empty).
 * @param wallet - Wallet instance from `walletContext()`.
 * @throws `CliError` with code `config` when `wallet.borrow` is undefined.
 */
export function requireBorrowCapability<W extends Wallet>(
  wallet: W,
): asserts wallet is W & { borrow: NonNullable<W['borrow']> } {
  if (!wallet.has('borrow')) {
    throw new CliError(
      'config',
      'Borrowing is not configured (no providers in config.borrow)',
    )
  }
}
