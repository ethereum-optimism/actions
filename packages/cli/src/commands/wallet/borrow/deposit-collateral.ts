import { parseAmount } from '@/utils/parseAmount.js'
import { parseApprovalMode } from '@/utils/parseApprovalMode.js'

import { runBorrowAction } from './runBorrowAction.js'

export interface BorrowDepositCollateralFlags {
  market: string
  amount: string
  /** Optional override of the wallet-level approval-amount strategy. */
  approvalMode?: string
}

/**
 * @description Handler for `actions wallet borrow deposit-collateral --market <name> --amount <n> [--approval-mode <exact|max>]`. Tops up collateral on an existing borrow position without changing the debt side. No `--max` flag: the SDK accepts only the strict `Amount` shape because depositing requires a finite amount the wallet currently holds (a "max balance" path would race the wallet's live token balance against pending state).
 * @param flags - Commander-parsed required options.
 */
export async function runWalletBorrowDepositCollateral(
  flags: BorrowDepositCollateralFlags,
): Promise<void> {
  const amount = parseAmount(flags.amount, '--amount')
  const approvalMode = parseApprovalMode(flags.approvalMode)
  await runBorrowAction({
    action: 'depositCollateral',
    marketName: flags.market,
    buildAndDispatch: async (wallet, market) =>
      wallet.borrow.depositCollateral({
        market,
        amount: { amount },
        approvalMode,
      }),
    envelopeAmounts: { collateralAmount: amount },
  })
}
