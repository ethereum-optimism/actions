import type { Address } from 'viem'

import type { LendProvider } from '@/lend/provider.js'
import type {
  LendOptions,
  LendTransaction,
  WalletLendOperations,
} from '@/types/lend.js'

import { VerbsLendNamespace } from './VerbsLendNamespace.js'

/**
 * Wallet Lend Namespace
 * @description Full lending operations available on wallet.lend
 */
export class WalletLendNamespace
  extends VerbsLendNamespace
  implements WalletLendOperations
{
  constructor(
    provider: LendProvider,
    private readonly wallet: { address: Address },
  ) {
    super(provider)
  }

  /**
   * Lend assets to a market
   * @description Will be renamed to execute() in the future
   */
  async lend(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    // Set receiver to wallet address if not specified
    const lendOptions: LendOptions = {
      ...options,
      receiver: options?.receiver || this.wallet.address,
    }

    return this.provider.lend(asset, amount, marketId, lendOptions)
  }

  /**
   * Deposit assets to a market (alias for lend)
   */
  async deposit(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    return this.lend(asset, amount, marketId, options)
  }

  /**
   * Withdraw assets from a market
   */
  async withdraw(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    // Set receiver to wallet address if not specified
    const withdrawOptions: LendOptions = {
      ...options,
      receiver: options?.receiver || this.wallet.address,
    }

    return this.provider.withdraw(asset, amount, marketId, withdrawOptions)
  }
}