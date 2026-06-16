import { isAddressEqual } from 'viem'

import { QUOTE_DISCRIMINATOR } from '@/actions/shared/quoteDiscriminator.js'
import { BaseSwapNamespace } from '@/actions/swap/namespaces/BaseSwapNamespace.js'
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
   * equal this wallet's address; otherwise the calldata would route output
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
   * quote's recipient differs from `wallet.address`; silently swapping
   * recipients would route output tokens to the wrong address on routers that
   * encode the recipient directly into calldata (e.g. Velodrome v2/leaf).
   *
   * Invariant: `wallet.address` is the *receiving* address, not the signer.
   *
   * Recipient is who receives the output tokens. For a smart wallet that is the
   * smart-wallet contract address; for an EOA wallet it is the EOA. In both
   * cases it equals `wallet.address`, which is exactly what a quote built via
   * `getQuote()` encodes as its recipient.
   *
   * Executor is who signs and submits the transaction (an EOA key, a
   * smart-wallet owner, or a session-key holder). The executor's address can
   * differ from `wallet.address` — e.g. a session-key signer authoring a
   * UserOperation for a smart wallet (see #403).
   *
   * The comparison is therefore `recipient === wallet.address`, never
   * `recipient === signer`. It stays correct regardless of who actually signed,
   * because the check asserts the quote was built to pay *this* wallet, not
   * anything about the executor's identity.
   */
  private requireQuoteForThisWallet(quote: SwapQuote): SwapQuote {
    if (!isAddressEqual(quote.recipient, this.wallet.address)) {
      throw new QuoteRecipientMismatchError({
        quoteRecipient: quote.recipient,
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
