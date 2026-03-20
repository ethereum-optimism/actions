import type { SupportedChainId } from '@/constants/supportedChains.js'
import { BaseSwapNamespace } from '@/swap/namespaces/BaseSwapNamespace.js'
import type { SwapRoutingConfig } from '@/types/actions.js'
import type {
  SwapProviders,
  SwapQuote,
  SwapReceipt,
  SwapTransaction,
  WalletSwapParams,
} from '@/types/swap/index.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Wallet swap namespace (full operations with signing)
 * @description Provides execute() for swapping tokens
 */
export class WalletSwapNamespace extends BaseSwapNamespace {
  constructor(
    providers: SwapProviders,
    private readonly wallet: Wallet,
    routing?: SwapRoutingConfig,
  ) {
    super(providers, routing)
  }

  /**
   * Execute a token swap.
   * Accepts either raw params (re-quotes internally) or a pre-built SwapQuote (skips re-quoting).
   */
  async execute(params: WalletSwapParams | SwapQuote): Promise<SwapReceipt> {
    // SwapQuote path: pass through to provider, no need to inject walletAddress
    if ('execution' in params) {
      const provider = this.resolveProvider(
        params.provider,
        params.assetIn,
        params.assetOut,
        params.chainId,
      )
      const swapTx = await provider.execute(params)
      const receipt = await this.executeTransaction(swapTx, params.chainId)
      return this.buildReceipt(swapTx, receipt)
    }

    const provider = this.resolveProvider(
      params.provider,
      params.assetIn,
      params.assetOut,
      params.chainId,
    )

    // Build swap transaction
    const swapTx = await provider.execute({
      ...params,
      walletAddress: this.wallet.address,
    })

    // Execute transaction(s)
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
      amountInWei: swapTx.amountInWei,
      amountOutWei: swapTx.amountOutWei,
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
