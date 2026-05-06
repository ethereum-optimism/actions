import { APPROVAL_MODES, type ApprovalMode } from '@eth-optimism/actions-sdk'

import { walletContext } from '@/context/walletContext.js'
import { CliError, rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { configuredMarkets, resolveMarket } from '@/resolvers/markets.js'
import { parseAmount } from '@/utils/parseAmount.js'
import { ensureOnchainSuccess, toReceiptArray } from '@/utils/receipts.js'

import { requireLendCapability } from './requireLendCapability.js'

export interface LendOpenFlags {
  market: string
  amount: string
  /** Optional override of the wallet-level approval-amount strategy. */
  approvalMode?: string
}

/**
 * @description At-least-one-of `amount` / `max`. The `?: never` branches make TS reject `{ market }` (neither set) and `{ market, amount, max }` (both set) at the call site; the runtime mutex check still runs because commander's argv parsing is loosely typed.
 */
export type LendCloseFlags =
  | { market: string; amount: string; max?: never }
  | { market: string; amount?: never; max: true }

type LendAction = 'open' | 'close'

function parseApprovalMode(raw: string | undefined): ApprovalMode | undefined {
  if (raw === undefined) return undefined
  if ((APPROVAL_MODES as readonly string[]).includes(raw)) {
    return raw as ApprovalMode
  }
  throw new CliError(
    'validation',
    `Invalid --approval-mode: ${raw} (expected ${APPROVAL_MODES.join(' or ')})`,
    { approvalMode: raw },
  )
}

/**
 * @description Shared backbone for the wallet-scoped lend write commands. `open` and `close` are mechanically identical apart from which `wallet.lend.*Position` method is called, the literal `action` value embedded in the output envelope, and the action-specific flags (`open` consumes `--approval-mode`; `close` accepts `--max`). This helper resolves the market, validates the amount, dispatches to the SDK, normalises the receipt array, raises on revert, and emits a `LendActionDoc` envelope.
 */
export async function runLendAction(
  action: 'open',
  flags: LendOpenFlags,
): Promise<void>
export async function runLendAction(
  action: 'close',
  flags: LendCloseFlags,
): Promise<void>
export async function runLendAction(
  action: LendAction,
  flags: LendOpenFlags | LendCloseFlags,
): Promise<void> {
  // Commander parses argv as a loosely-typed object, so mutex enforcement
  // still runs at runtime even though the public union excludes the bad
  // `{ amount, max: true }` shape statically.
  const isMaxClose = action === 'close' && hasMax(flags)
  const looseAmount = (flags as { amount?: string }).amount
  if (isMaxClose && looseAmount !== undefined) {
    throw new CliError(
      'validation',
      'Pass either --amount or --max, not both',
      { amount: looseAmount, max: true },
    )
  }
  if (!isMaxClose && looseAmount === undefined) {
    throw new CliError(
      'validation',
      action === 'close'
        ? 'Either --amount or --max is required'
        : 'Required option --amount <n> not specified',
    )
  }
  const { wallet, config } = await walletContext()
  requireLendCapability(wallet)
  const market = resolveMarket(flags.market, configuredMarkets(config))
  const marketId = { address: market.address, chainId: market.chainId }
  const approvalMode =
    action === 'open'
      ? parseApprovalMode((flags as LendOpenFlags).approvalMode)
      : undefined
  try {
    // For `close --max`, read the wallet's current position first and pass
    // its formatted balance through `parseAmount` for the same validation
    // path as a user-supplied amount. This races inflight interest accrual,
    // so the dispatched amount may be slightly less than the live balance
    // by the time the tx lands.
    const amount = isMaxClose
      ? parseAmount(
          (await wallet.lend.getPosition({ marketId })).balanceFormatted,
        )
      : parseAmount(looseAmount as string)
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

function hasMax(
  flags: LendOpenFlags | LendCloseFlags,
): flags is { market: string; amount?: never; max: true } {
  return 'max' in flags && flags.max === true
}
