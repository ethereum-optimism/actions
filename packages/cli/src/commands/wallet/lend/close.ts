import { walletContext } from '@/context/walletContext.js'
import { CliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { resolveMarket } from '@/resolvers/markets.js'

import {
  ensureOnchainSuccess,
  parseAmount,
  rethrowAsCliError,
  toReceiptArray,
} from './util.js'

export interface LendCloseFlags {
  market: string
  amount: string
}

/**
 * @description Handler for `actions wallet lend close --market <name>
 * --amount <n>`. Resolves the market through the config allowlist,
 * delegates to `wallet.lend.closePosition`, and emits a structured
 * receipt envelope. The amount is the human-readable quantity to
 * withdraw - the SDK converts to wei. Reverts surface as `onchain`;
 * RPC failures as retryable `network`.
 * @param flags - Commander-parsed required options.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runWalletLendClose(flags: LendCloseFlags): Promise<void> {
  const { wallet, config } = await walletContext()
  if (!wallet.lend) {
    throw new CliError(
      'config',
      'Lending is not configured (no providers in config.lend)',
    )
  }
  const market = resolveMarket(flags.market, config)
  const amount = parseAmount(flags.amount)
  try {
    const receipt = await wallet.lend.closePosition({
      asset: market.asset,
      marketId: { address: market.address, chainId: market.chainId },
      amount,
    })
    const receipts = toReceiptArray(receipt)
    ensureOnchainSuccess(receipts)
    printOutput('lendClose', {
      action: 'close',
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
