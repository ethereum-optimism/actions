import type { Address, Hash } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { VerbsLendNamespace } from '@/lend/namespaces/VerbsLendNamespace.js'
import type { LendProvider } from '@/lend/provider.js'
import type {
  BaseLendConfig,
  LendOpenPositionParams,
  LendOptions,
  LendTransaction,
} from '@/types/lend.js'
import type { SmartWallet } from '@/wallet/base/SmartWallet.js'
import type { Wallet } from '@/wallet/base/Wallet.js'

/**
 * Wallet Lend Namespace
 * @description Full lending operations available on wallet.lend
 */
export class WalletLendNamespace<
  TConfig extends BaseLendConfig = BaseLendConfig,
> extends VerbsLendNamespace<TConfig> {
  constructor(
    provider: LendProvider<TConfig>,
    private readonly wallet: Wallet,
  ) {
    super(provider)
  }

  /**
   * Open a lending position
   * @description Signs and sends a lend transaction from the wallet for the given amount and asset
   */
  async openPosition({
    amount,
    asset,
    marketId,
    options,
  }: LendOpenPositionParams): Promise<Hash> {
    // Always use wallet address as receiver, ignore any receiver in options
    const lendOptions = {
      ...options,
      receiver: this.wallet.address,
    }

    // Get transaction details from provider
    const lendTransaction = await this.provider.openPosition({
      amount,
      asset,
      marketId,
      options: lendOptions,
    })

    // Execute the transaction using wallet
    const { transactionData } = lendTransaction
    if (!transactionData) {
      throw new Error('No transaction data returned from lend provider')
    }

    // Check if wallet is a SmartWallet (has send/sendBatch methods)
    if (!this.isSmartWallet(this.wallet)) {
      throw new Error(
        'Transaction execution is only supported for SmartWallet instances',
      )
    }

    // Execute approval + deposit or just deposit
    if (transactionData.approval) {
      return await this.wallet.sendBatch(
        [transactionData.approval, transactionData.deposit],
        marketId.chainId,
      )
    }

    return await this.wallet.send(transactionData.deposit, marketId.chainId)
  }

  /**
   * Type guard to check if wallet is a SmartWallet
   */
  private isSmartWallet(wallet: Wallet): wallet is SmartWallet {
    return (
      'send' in wallet &&
      typeof wallet.send === 'function' &&
      'sendBatch' in wallet &&
      typeof wallet.sendBatch === 'function'
    )
  }

  /**
   * Withdraw assets from a market
   */
  async withdraw(
    asset: Address,
    amount: bigint,
    chainId: SupportedChainId,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    // Always use wallet address as receiver, ignore any receiver in options
    const withdrawOptions: LendOptions = {
      ...options,
      receiver: this.wallet.address,
    }

    return this.provider.withdraw(
      asset,
      amount,
      chainId,
      marketId,
      withdrawOptions,
    )
  }
}
