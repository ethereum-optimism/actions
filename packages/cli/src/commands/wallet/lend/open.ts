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

export interface LendOpenFlags {
  market: string
  amount: string
}

/**
 * @description Handler for `actions wallet lend open --market <name>
 * --amount <n>`. Resolves the market through the config allowlist,
 * delegates to `wallet.lend.openPosition` (which dispatches an optional
 * ERC-20 approval + the position call as a single sendBatch on EOA), and
 * emits a structured receipt envelope. Reverts surface as `onchain`;
 * RPC failures as retryable `network`. Both flags are enforced as
 * required by commander, so the handler trusts they are present.
 * @param flags - Commander-parsed required options.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runWalletLendOpen(flags: LendOpenFlags): Promise<void> {
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
    const receipt = await wallet.lend.openPosition({
      asset: market.asset,
      marketId: { address: market.address, chainId: market.chainId },
      amount,
    })
    const receipts = toReceiptArray(receipt)
    ensureOnchainSuccess(receipts)
    printOutput('lendOpen', {
      action: 'open',
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
