import { isAddressEqual } from 'viem'

import { BaseBorrowNamespace } from '@/actions/borrow/namespaces/BaseBorrowNamespace.js'
import { QUOTE_DISCRIMINATOR } from '@/actions/shared/quoteDiscriminator.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  QuoteExpiredError,
  QuoteRecipientMismatchError,
} from '@/core/error/errors.js'
import type { BorrowSettings } from '@/types/actions.js'
import type {
  BorrowClosePositionParams,
  BorrowDepositCollateralParams,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowOpenPositionParams,
  BorrowQuote,
  BorrowReceipt,
  BorrowRepayParams,
  BorrowWithdrawCollateralParams,
  GetBorrowPositionParams,
} from '@/types/borrow/index.js'
import type { BorrowProviders } from '@/types/providers.js'
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
    settings?: BorrowSettings,
  ) {
    super(providers)
    // Settings are forwarded into providers at construction time elsewhere
    // (Actions wiring). Holding a copy here is reserved for future namespace-
    // level concerns (telemetry, default health buffer overrides) and kept
    // intentionally unused for now.
    void settings
  }

  /**
   * @description Read the wallet's position on a borrow market. Binds the
   * recipient to `this.wallet.address` so callers don't need to pass it
   * explicitly. Returns an empty (collateral=0, debt=0) sentinel when
   * the wallet has never interacted with the market.
   * @param params Market identity (`{ marketId }`) plus optional reader hints.
   * @returns The wallet's position on the given market.
   * @throws If the underlying provider's RPC fetch fails.
   */
  async getPosition(
    params: Omit<GetBorrowPositionParams, 'walletAddress'>,
  ): Promise<BorrowMarketPosition> {
    return this.getProviderForMarket(params.marketId).getPosition({
      ...params,
      walletAddress: this.wallet.address,
    })
  }

  async openPosition(
    params: BorrowOpenPositionParams | BorrowQuote,
  ): Promise<BorrowReceipt> {
    const quote = await this.resolveQuote(params, (raw) =>
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
    const quote = await this.resolveQuote(params, (raw) =>
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
    const quote = await this.resolveQuote(params, (raw) =>
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
    const quote = await this.resolveQuote(params, (raw) =>
      this.getProviderForMarket(raw.market).withdrawCollateral({
        ...raw,
        walletAddress: this.wallet.address,
      }),
    )
    return this.dispatch(quote)
  }

  async repay(params: BorrowRepayParams | BorrowQuote): Promise<BorrowReceipt> {
    const quote = await this.resolveQuote(params, (raw) =>
      this.getProviderForMarket(raw.market).repay({
        ...raw,
        walletAddress: this.wallet.address,
      }),
    )
    return this.dispatch(quote)
  }

  /**
   * Resolve the input union to a `BorrowQuote`. Pre-built quotes are
   * validated for recipient + market + expiration before being returned;
   * raw params are re-quoted via the supplied builder.
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
    requote: (raw: TParams) => Promise<BorrowQuote>,
  ): Promise<BorrowQuote> {
    if (QUOTE_DISCRIMINATOR in params) {
      const quote = params as BorrowQuote
      return this.validateQuoteForThisWallet(quote)
    }
    return requote(params as TParams)
  }

  /**
   * Defensive checks before dispatching a pre-built quote: recipient is
   * bound to this wallet (calldata routes here), the quote has not expired,
   * and the marketid the quote targets matches what the wallet thinks it
   * is acting on — guards against backend-issued quotes being dispatched
   * against a different market by accident.
   */
  private validateQuoteForThisWallet(quote: BorrowQuote): BorrowQuote {
    if (!isAddressEqual(quote.recipient, this.wallet.address)) {
      throw new QuoteRecipientMismatchError({
        quoteRecipient: quote.recipient,
        walletAddress: this.wallet.address,
      })
    }
    const now = Math.floor(Date.now() / 1000)
    if (now >= quote.expiresAt) {
      throw new QuoteExpiredError({
        expiresAt: quote.expiresAt,
        currentTime: now,
      })
    }
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
