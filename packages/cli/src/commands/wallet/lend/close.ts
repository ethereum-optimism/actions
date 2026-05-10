import { type LendCloseFlags, runLendAction } from './runLendAction.js'

export type { LendCloseFlags }

/**
 * @description Handler for `actions wallet lend close --market <name> (--amount <n> | --max)`. Delegates to `runLendAction('close', flags)` which resolves the market through the config allowlist, dispatches `wallet.lend.closePosition`, and emits a `LendActionDoc` envelope. Reverts surface as `onchain`; SDK validation errors as `validation`; unknown failures as retryable `network`.
 * @param flags - Commander-parsed required options.
 */
export async function runWalletLendClose(flags: LendCloseFlags): Promise<void> {
  await runLendAction('close', flags)
}
