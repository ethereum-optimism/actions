import type { Wallet } from '@eth-optimism/actions-sdk'

import { CliError } from '@/output/errors.js'

/**
 * @description Asserts that a `Wallet` has the lend namespace configured. Defers the runtime check to `Wallet.has('lend')` and narrows `wallet.lend` to non-null on the caller side so each handler can reach `wallet.lend.openPosition` etc. without re-checking. Throws `CliError('config')` when no lend providers are configured (`ActionsConfig.lend` was omitted or empty).
 * @param wallet - Wallet instance from `walletContext()`.
 * @throws `CliError` with code `config` when `wallet.lend` is undefined.
 */
export function requireLendCapability<W extends Wallet>(
  wallet: W,
): asserts wallet is W & { lend: NonNullable<W['lend']> } {
  if (!wallet.has('lend')) {
    throw new CliError(
      'config',
      'Lending is not configured (no providers in config.lend)',
    )
  }
}
