import { walletContext } from '@/context/walletContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { collectMarkets, resolveMarket } from '@/resolvers/markets.js'
import { parseAmount } from '@/utils/parseAmount.js'
import { ensureOnchainSuccess, toReceiptArray } from '@/utils/receipts.js'

import { requireLendCapability } from './requireLendCapability.js'

export interface LendActionFlags {
  market: string
  amount: string
}

type LendAction = 'open' | 'close'

/**
 * @description Shared backbone for the wallet-scoped lend write commands. `open` and `close` are mechanically identical apart from which `wallet.lend.*Position` method is called and the literal `action` value embedded in the output envelope. This helper resolves the market, validates the amount, dispatches to the SDK, normalises the receipt array, raises on revert, and emits a `LendActionDoc` envelope.
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
  try {
    const receipt =
      action === 'open'
        ? await wallet.lend.openPosition({
            asset: market.asset,
            marketId: { address: market.address, chainId: market.chainId },
            amount,
          })
        : await wallet.lend.closePosition({
            asset: market.asset,
            marketId: { address: market.address, chainId: market.chainId },
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
