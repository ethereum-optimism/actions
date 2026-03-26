import type { SupportedChainId } from '@/constants/supportedChains.js'
import { BaseSwapNamespace } from '@/swap/namespaces/BaseSwapNamespace.js'
import type { SwapSettings } from '@/types/actions.js'
import type {
  SwapProviders,
  SwapQuote,
  SwapQuoteParams,
  SwapReceipt,
  SwapTransaction,
  WalletSwapParams,
} from '@/types/swap/index.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Wallet swap namespace with full operations including signing.
 * Provides getQuote() for pricing and execute() for swapping tokens.
 */
export class WalletSwapNamespace extends BaseSwapNamespace {
  constructor(
    providers: SwapProviders,
    private readonly wallet: Wallet,
    settings?: SwapSettings,
  ) {
    super(providers, settings)
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
   * Accepts either raw params (re-quotes internally) or a pre-built SwapQuote (skips re-quoting).
   * @param params - Swap parameters or a pre-built SwapQuote from getQuote()
   * @returns Swap receipt with transaction details
   */
  async execute(params: WalletSwapParams | SwapQuote): Promise<SwapReceipt> {
    // Inject walletAddress — raw params need it for validation,
    // quotes need it for on-chain allowance checks during approval building
    const executeParams =
      'execution' in params
        ? { ...params, recipient: this.wallet.address }
        : { ...params, walletAddress: this.wallet.address }

    const provider = this.resolveProvider(
      params.provider,
      params.assetIn,
      params.assetOut,
      params.chainId,
    )

    const swapTx = await provider.execute(executeParams)
    const receipt = await this.executeTransaction(swapTx, params.chainId)
    return this.buildReceipt(swapTx, receipt)
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
   * Execute swap transaction with approval batching
   */
  private async executeTransaction(
    swapTx: SwapTransaction,
    chainId: SupportedChainId,
  ): Promise<SwapReceipt['receipt']> {
    const { transactionData } = swapTx
    const txs = []

    // Add token approval if needed
    if (transactionData.tokenApproval) {
      txs.push(transactionData.tokenApproval)
    }

    // Add Permit2 approval if needed
    if (transactionData.permit2Approval) {
      txs.push(transactionData.permit2Approval)
    }

    // Add main swap transaction
    txs.push(transactionData.swap)

    // Execute as batch if multiple transactions, otherwise single
    if (txs.length > 1) {
      return this.wallet.sendBatch(txs, chainId)
    }
    return this.wallet.send(transactionData.swap, chainId)
  }
}
