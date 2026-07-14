import { isAddressEqual } from 'viem'

import { QUOTE_DISCRIMINATOR } from '@/actions/shared/quoteDiscriminator.js'
import { BaseSwapNamespace } from '@/actions/swap/namespaces/BaseSwapNamespace.js'
import {
  resolveSwapQuoteWalletAddress,
  resolveSwapRequestRecipient,
} from '@/actions/swap/recipients.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { QuoteRecipientMismatchError } from '@/core/error/errors.js'
import type { SwapExecuteParamsResolved } from '@/services/nameservices/ens/types.js'
import type { RecipientResolver } from '@/services/nameservices/ens/utils.js'
import type { SwapSettings } from '@/types/actions.js'
import type {
  SwapProviders,
  SwapQuote,
  SwapQuoteParams,
  SwapReceipt,
  SwapTransaction,
  WalletSwapParams,
} from '@/types/swap/index.js'
import type { TransactionData } from '@/types/transaction.js'
import { executeTransactionBatch } from '@/wallet/core/utils/executeTransactionBatch.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Wallet swap namespace with full operations including signing.
 * Provides getQuote() for pricing and execute() for swapping tokens.
 */
export class WalletSwapNamespace extends BaseSwapNamespace {
  constructor(
    providers: SwapProviders,
    private readonly wallet: Wallet,
    resolveRecipient?: RecipientResolver,
    settings?: SwapSettings,
  ) {
    super(providers, resolveRecipient, settings)
  }

  /**
   * Get a swap quote bound to the wallet as executor.
   * Defaults the output recipient to the wallet address when omitted.
   */
  override async getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    const quote = await super.getQuote({
      ...params,
      recipient: resolveSwapRequestRecipient(
        params.recipient,
        this.wallet.address,
      ),
      walletAddress: this.wallet.address,
    })
    return { ...quote, walletAddress: this.wallet.address }
  }

  /**
   * Get quotes from all providers bound to the wallet as executor.
   */
  override async getQuotes(params: SwapQuoteParams): Promise<SwapQuote[]> {
    const quotes = await super.getQuotes({
      ...params,
      recipient: resolveSwapRequestRecipient(
        params.recipient,
        this.wallet.address,
      ),
      walletAddress: this.wallet.address,
    })
    return quotes.map((quote) => ({
      ...quote,
      walletAddress: this.wallet.address,
    }))
  }

  /**
   * Execute a token swap.
   * Accepts either raw params (re-quotes internally) or a pre-built SwapQuote
   * (skips re-quoting). When a pre-built quote is passed, its wallet address
   * must equal this wallet's address so approvals are checked against the
   * account that will execute the swap. Re-quote via
   * `wallet.swap.getQuote(...)` to bind the quote to this wallet.
   * @param params - Swap parameters or a pre-built SwapQuote from getQuote()
   * @returns Swap receipt with transaction details
   * @throws If `params` is a SwapQuote bound to a different wallet
   */
  async execute(params: WalletSwapParams | SwapQuote): Promise<SwapReceipt> {
    const executeParams =
      QUOTE_DISCRIMINATOR in params
        ? this.requireQuoteForThisWallet(params)
        : await this.resolveRawParams(params)

    const provider = this.resolveProvider(
      params.provider,
      params.assetIn,
      params.assetOut,
      params.chainId,
    )

    const swapTx = await provider.execute(executeParams)
    const receipt = await this.dispatch(swapTx, params.chainId)
    return this.buildReceipt(swapTx, receipt)
  }

  /**
   * Validate that a pre-built quote is bound to this wallet. Throws when the
   * quote's wallet address differs from `wallet.address`; silently executing
   * with a different wallet would check allowances for the wrong account.
   */
  private requireQuoteForThisWallet(quote: SwapQuote): SwapQuote {
    const quoteWalletAddress = resolveSwapQuoteWalletAddress(quote)
    if (!isAddressEqual(quoteWalletAddress, this.wallet.address)) {
      throw new QuoteRecipientMismatchError({
        quoteRecipient: quoteWalletAddress,
        walletAddress: this.wallet.address,
      })
    }
    return quote
  }

  /**
   * Inject `walletAddress` (needed for validation and on-chain allowance
   * checks) and resolve any ENS recipient so providers only ever receive an
   * `Address`.
   */
  private async resolveRawParams(
    params: WalletSwapParams,
  ): Promise<SwapExecuteParamsResolved> {
    return {
      ...params,
      walletAddress: this.wallet.address,
      recipient: await this.resolveRecipient(
        resolveSwapRequestRecipient(params.recipient, this.wallet.address),
      ),
    }
  }

  private buildReceipt(
    swapTx: SwapTransaction,
    receipt: SwapReceipt['receipt'],
  ): SwapReceipt {
    return {
      receipt,
      amountIn: swapTx.amountIn,
      amountOut: swapTx.amountOut,
      amountInRaw: swapTx.amountInRaw,
      amountOutRaw: swapTx.amountOutRaw,
      assetIn: swapTx.assetIn,
      assetOut: swapTx.assetOut,
      price: swapTx.price,
      priceImpact: swapTx.priceImpact,
    }
  }

  /**
   * Send a swap transaction, collecting any token/Permit2 approvals ahead
   * of the swap call. Defers to `executeTransactionBatch` for the actual
   * 1-vs-N send/sendBatch dispatch.
   */
  private dispatch(
    swapTx: SwapTransaction,
    chainId: SupportedChainId,
  ): Promise<SwapReceipt['receipt']> {
    const { transactionData } = swapTx
    const txs: TransactionData[] = []
    if (transactionData.tokenApproval) txs.push(transactionData.tokenApproval)
    if (transactionData.permit2Approval) {
      txs.push(transactionData.permit2Approval)
    }
    txs.push(transactionData.swap)
    return executeTransactionBatch(this.wallet, txs, chainId)
  }
}
