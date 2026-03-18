import type { SupportedChainId } from '@/constants/supportedChains.js'
import { BaseSwapNamespace } from '@/swap/namespaces/BaseSwapNamespace.js'
import type {
  SwapProviders,
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
  ) {
    super(providers)
  }

  /**
   * Execute a token swap
   * @param params - Swap parameters including chainId
   * @returns Swap receipt with transaction details
   */
  async execute(params: WalletSwapParams): Promise<SwapReceipt> {
    const provider = this.getProvider()

    // Build swap transaction
    const swapTx = await provider.execute({
      ...params,
      walletAddress: this.wallet.address,
    })

    // Execute transaction(s)
    const receipt = await this.executeTransaction(swapTx, params.chainId)

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
