import {
  validateBorrowMarketIdInAnyAllowlist,
  validateQuoteAction,
  validateQuoteNotExpired,
} from '@/actions/borrow/core/validations.js'
import { BaseBorrowNamespace } from '@/actions/borrow/namespaces/BaseBorrowNamespace.js'
import { QUOTE_DISCRIMINATOR } from '@/actions/shared/quoteDiscriminator.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  BorrowClosePositionParams,
  BorrowDepositCollateralParams,
  BorrowMarketId,
  BorrowOpenPositionParams,
  BorrowQuote,
  BorrowReceipt,
  BorrowRepayParams,
  BorrowWithdrawCollateralParams,
} from '@/types/borrow/index.js'
import type { BorrowProviders } from '@/types/providers.js'
import { validateChainSupported } from '@/utils/validation.js'
import { executeTransactionBatch } from '@/wallet/core/utils/executeTransactionBatch.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Wallet-bound borrow namespace exposed on `wallet.borrow`.
 * @description Binds quotes to the wallet's address (so recipient-baked
 * calldata routes to this account), validates pre-built quotes against
 * tamper paths, and dispatches via `executeTransactionBatch` (1 send vs
 * sendBatch decision lives there).
 */
export class WalletBorrowNamespace extends BaseBorrowNamespace {
  constructor(
    providers: BorrowProviders,
    private readonly wallet: Wallet,
  ) {
    super(providers)
  }

  async openPosition(
    params: BorrowOpenPositionParams | BorrowQuote,
  ): Promise<BorrowReceipt> {
    const quote = await this.resolveQuote(params, 'open', (raw) =>
      this.getProviderForMarket(raw.market).openPosition({
        ...raw,
        walletAddress: this.wallet.address,
      }),
    )
    return this.dispatch(quote)
  }

  async closePosition(
    params: BorrowClosePositionParams | BorrowQuote,
  ): Promise<BorrowReceipt> {
    const quote = await this.resolveQuote(params, 'close', (raw) =>
      this.getProviderForMarket(raw.market).closePosition({
        ...raw,
        walletAddress: this.wallet.address,
      }),
    )
    return this.dispatch(quote)
  }

  async depositCollateral(
    params: BorrowDepositCollateralParams | BorrowQuote,
  ): Promise<BorrowReceipt> {
    const quote = await this.resolveQuote(params, 'depositCollateral', (raw) =>
      this.getProviderForMarket(raw.market).depositCollateral({
        ...raw,
        walletAddress: this.wallet.address,
      }),
    )
    return this.dispatch(quote)
  }

  async withdrawCollateral(
    params: BorrowWithdrawCollateralParams | BorrowQuote,
  ): Promise<BorrowReceipt> {
    const quote = await this.resolveQuote(params, 'withdrawCollateral', (raw) =>
      this.getProviderForMarket(raw.market).withdrawCollateral({
        ...raw,
        walletAddress: this.wallet.address,
      }),
    )
    return this.dispatch(quote)
  }

  async repay(params: BorrowRepayParams | BorrowQuote): Promise<BorrowReceipt> {
    const quote = await this.resolveQuote(params, 'repay', (raw) =>
      this.getProviderForMarket(raw.market).repay({
        ...raw,
        walletAddress: this.wallet.address,
      }),
    )
    return this.dispatch(quote)
  }

  /**
   * Resolve the input union to a `BorrowQuote`. Pre-built quotes are
   * validated for action + chain + allowlisted market + expiration before
   * being returned; raw params are re-quoted via the supplied builder.
   */
  private async resolveQuote<
    TParams extends {
      market: {
        kind: BorrowMarketId['kind']
        marketId: string
        chainId: SupportedChainId
      }
    },
  >(
    params: TParams | BorrowQuote,
    expectedAction: BorrowQuote['action'],
    requote: (raw: TParams) => Promise<BorrowQuote>,
  ): Promise<BorrowQuote> {
    if (isBorrowQuote(params)) {
      return this.validateQuoteForThisWallet(params, expectedAction)
    }
    return requote(params)
  }

  /**
   * Defensive checks before dispatching a pre-built quote: the action
   * matches the dispatch method, the quote has not expired, the chain is
   * supported by this wallet namespace, and the market id is present in a
   * configured provider allowlist. Borrow quotes don't carry a per-call
   * recipient (the underlying calldata always routes to the borrowing
   * wallet), so no recipient binding check is needed.
   */
  private validateQuoteForThisWallet(
    quote: BorrowQuote,
    expectedAction: BorrowQuote['action'],
  ): BorrowQuote {
    validateQuoteAction(quote, expectedAction)
    validateQuoteNotExpired(quote)
    validateChainSupported(quote.marketId.chainId, this.supportedChainIds())
    validateBorrowMarketIdInAnyAllowlist(quote.marketId, this.getAllProviders())
    return quote
  }

  /**
   * Send the quote's transaction bundle through the wallet. Defers to
   * `executeTransactionBatch` for the actual 1-vs-N send/sendBatch
   * dispatch (same primitive used by lend and swap), then denormalizes
   * the underlying receipt's identifying hash(es) onto the envelope so
   * downstream consumers (backend response decoration, etc.) don't have
   * to downcast the receipt union.
   */
  private async dispatch(quote: BorrowQuote): Promise<BorrowReceipt> {
    const receipt = await executeTransactionBatch(
      this.wallet,
      [...quote.execution.transactions],
      quote.marketId.chainId,
    )
    return {
      receipt,
      action: quote.action,
      borrowAmount: quote.borrowAmountRaw,
      collateralAmount: quote.collateralAmountRaw,
      marketId: quote.marketId,
      positionAfter: quote.positionAfter,
      ...extractReceiptHashes(receipt),
    }
  }
}

function isBorrowQuote<TParams extends { market: unknown }>(
  params: TParams | BorrowQuote,
): params is BorrowQuote {
  return (
    QUOTE_DISCRIMINATOR in params &&
    'action' in params &&
    'execution' in params &&
    'expiresAt' in params &&
    'positionAfter' in params
  )
}

/**
 * Pull the user-facing identifier hash(es) out of the underlying receipt
 * union so they can be set on the `BorrowReceipt` envelope. Batched EOA
 * receipts surface as `transactionHashes`, single EOA receipts as
 * `transactionHash`, and ERC-4337 receipts as `userOpHash` (the inner
 * `receipt.transactionHash` is also present, but the userOp hash is the
 * right identifier for explorers that index UserOperations).
 */
function extractReceiptHashes(
  receipt: BorrowReceipt['receipt'],
): Pick<BorrowReceipt, 'transactionHash' | 'transactionHashes' | 'userOpHash'> {
  if (Array.isArray(receipt)) {
    return { transactionHashes: receipt.map((r) => r.transactionHash) }
  }
  if ('userOpHash' in receipt) {
    return { userOpHash: receipt.userOpHash }
  }
  return { transactionHash: receipt.transactionHash }
}
