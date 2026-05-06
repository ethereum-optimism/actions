import { CliError } from '@/output/errors.js'

/**
 * @description Asserts that a `Wallet` has the lend namespace configured. Narrows `wallet.lend` to non-null on the caller side so each handler can reach `wallet.lend.openPosition` etc. without re-checking. Throws `CliError('config')` when no lend providers are configured (`ActionsConfig.lend` was omitted or empty).
 * @param wallet - Wallet instance from `walletContext()`.
 * @throws `CliError` with code `config` when `wallet.lend` is undefined.
 */
export function requireLendCapability<W extends { lend?: unknown }>(
  wallet: W,
): asserts wallet is W & { lend: NonNullable<W['lend']> } {
  if (!wallet.lend) {
    throw new CliError(
      'config',
      'Lending is not configured (no providers in config.lend)',
    )
  }
}
