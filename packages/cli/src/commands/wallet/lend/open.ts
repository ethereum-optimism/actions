import { type LendOpenFlags, runLendAction } from './runLendAction.js'

export type { LendOpenFlags }

/**
 * @description Handler for `actions wallet lend open --market <name> --amount <n>`. Delegates to `runLendAction('open', flags)` which resolves the market through the config allowlist, dispatches `wallet.lend.openPosition`, and emits a `LendActionDoc` envelope. Reverts surface as `onchain`; SDK validation errors as `validation`; unknown failures as retryable `network`.
 * @param flags - Commander-parsed required options.
 */
export async function runWalletLendOpen(flags: LendOpenFlags): Promise<void> {
  await runLendAction('open', flags)
}
