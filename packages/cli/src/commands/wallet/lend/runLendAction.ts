import { walletContext } from '@/context/walletContext.js'
import { CliError, rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { collectMarkets, resolveMarket } from '@/resolvers/markets.js'
import { parseAmount } from '@/utils/parseAmount.js'
import { ensureOnchainSuccess, toReceiptArray } from '@/utils/receipts.js'

import { requireLendCapability } from './requireLendCapability.js'

// Mirrors the SDK's `ApprovalMode = 'exact' | 'max'` (declared in
// `@/types/actions` but not re-exported from the SDK barrel).
type ApprovalMode = 'exact' | 'max'
const APPROVAL_MODES = [
  'exact',
  'max',
] as const satisfies readonly ApprovalMode[]

export interface LendActionFlags {
  market: string
  amount: string
  /** Only consumed by `open`; ignored on `close`. */
  approvalMode?: string
}

type LendAction = 'open' | 'close'

function parseApprovalMode(raw: string | undefined): ApprovalMode | undefined {
  if (raw === undefined) return undefined
  if ((APPROVAL_MODES as readonly string[]).includes(raw)) {
    return raw as ApprovalMode
  }
  throw new CliError(
    'validation',
    `Invalid --approval-mode: ${raw} (expected exact or max)`,
    { approvalMode: raw },
  )
}

/**
 * @description Shared backbone for the wallet-scoped lend write commands. `open` and `close` are mechanically identical apart from which `wallet.lend.*Position` method is called, the literal `action` value embedded in the output envelope, and `--approval-mode` (which only `open` consumes). This helper resolves the market, validates the amount, dispatches to the SDK, normalises the receipt array, raises on revert, and emits a `LendActionDoc` envelope.
 * @param action - Which `wallet.lend.*Position` method to invoke.
 * @param flags - Commander-parsed required options.
 */
export async function runLendAction(
  action: LendAction,
  flags: LendActionFlags,
): Promise<void> {
  const { wallet, config } = await walletContext()
  requireLendCapability(wallet)
  const market = resolveMarket(flags.market, collectMarkets(config))
  const amount = parseAmount(flags.amount)
  const approvalMode =
    action === 'open' ? parseApprovalMode(flags.approvalMode) : undefined
  try {
    const marketId = { address: market.address, chainId: market.chainId }
    const receipt =
      action === 'open'
        ? await wallet.lend.openPosition({
            asset: market.asset,
            marketId,
            amount,
            approvalMode,
          })
        : await wallet.lend.closePosition({
            asset: market.asset,
            marketId,
            amount,
          })
    const receipts = toReceiptArray(receipt)
    ensureOnchainSuccess(receipts)
    printOutput('lendAction', {
      action,
      market: {
        name: market.name,
        address: market.address,
        chainId: market.chainId,
        provider: market.lendProvider,
      },
      asset: { symbol: market.asset.metadata.symbol },
      amount,
      transactions: receipts,
    })
  } catch (err) {
    rethrowAsCliError(err)
  }
}
