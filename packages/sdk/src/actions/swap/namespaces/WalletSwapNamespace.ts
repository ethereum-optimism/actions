import { QUOTE_DISCRIMINATOR } from '@/actions/swap/core/SwapProvider.js'
import { BaseSwapNamespace } from '@/actions/swap/namespaces/BaseSwapNamespace.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
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
   * Get a swap quote with the wallet address as recipient.
   * Ensures calldata is encoded for the real wallet, not a placeholder.
   */
  override async getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    return super.getQuote({
      ...params,
      recipient: params.recipient ?? this.wallet.address,
    })
  }

  /**
   * Get quotes from all providers with the wallet address as recipient.
   */
  override async getQuotes(params: SwapQuoteParams): Promise<SwapQuote[]> {
    return super.getQuotes({
      ...params,
      recipient: params.recipient ?? this.wallet.address,
    })
  }

  /**
   * Execute a token swap.
   * Accepts either raw params (re-quotes internally) or a pre-built SwapQuote
   * (skips re-quoting). When a pre-built quote is passed, its recipient must
   * equal this wallet's address — otherwise the calldata would route output
   * tokens to a different address (a real risk on Velodrome v2/leaf paths
   * where the recipient is encoded directly into the swap call). Re-quote via
   * `wallet.swap.getQuote(...)` to bind the quote to this wallet.
   * @param params - Swap parameters or a pre-built SwapQuote from getQuote()
   * @returns Swap receipt with transaction details
   * @throws If `params` is a SwapQuote whose recipient differs from this wallet
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
   * quote's recipient differs from `wallet.address` — silently swapping
   * recipients would route output tokens to the wrong address on routers that
   * encode the recipient directly into calldata (e.g. Velodrome v2/leaf).
   */
  private requireQuoteForThisWallet(quote: SwapQuote): SwapQuote {
    if (quote.recipient !== this.wallet.address) {
      throw new Error(
        `SwapQuote was generated for a different recipient (${quote.recipient}). ` +
          `Re-quote via wallet.swap.getQuote(...) so calldata is bound to this wallet (${this.wallet.address}).`,
      )
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
        params.recipient ?? this.wallet.address,
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
