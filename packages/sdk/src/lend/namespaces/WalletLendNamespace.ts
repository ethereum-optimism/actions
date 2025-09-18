import type { Address } from 'viem'

import { VerbsLendNamespace } from '@/lend/namespaces/VerbsLendNamespace.js'
import type { LendProvider } from '@/lend/provider.js'
import type {
  BaseLendConfig,
  LendOptions,
  LendTransaction,
} from '@/types/lend.js'

/**
 * Wallet Lend Namespace
 * @description Full lending operations available on wallet.lend
 */
export class WalletLendNamespace<
  TConfig extends BaseLendConfig = BaseLendConfig,
> extends VerbsLendNamespace<TConfig> {
  constructor(
    provider: LendProvider<TConfig>,
    private readonly address: Address,
  ) {
    super(provider)
  }

  /**
   * Lend assets to a vault
   * @description Will be renamed to execute() in the future
   */
  async lendExecute(
    asset: Address,
    amount: bigint,
    chainId: number,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    // Set receiver to wallet address if not specified
    const lendOptions: LendOptions = {
      ...options,
      receiver: options?.receiver || this.address,
    }

    return this.provider.lend(asset, amount, chainId, marketId, lendOptions)
  }

  /**
   * Deposit assets to a market (alias for lend)
   */
  async deposit(
    asset: Address,
    amount: bigint,
    chainId: number,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    return this.lendExecute(asset, amount, chainId, marketId, options)
  }

  /**
   * Withdraw assets from a market
   */
  async withdraw(
    asset: Address,
    amount: bigint,
    chainId: number,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    // Set receiver to wallet address if not specified
    const withdrawOptions: LendOptions = {
      ...options,
      receiver: options?.receiver || this.address,
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
