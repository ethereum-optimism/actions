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
   * Open a lending position
   * @description Signs and sends a lend transaction from the wallet for the given amount and asset
   */
  async openPosition({
    amount,
    asset,
    marketId,
    options,
  }: LendOpenPositionParams): Promise<Hash> {
    // Inject wallet address as receiver if not specified
    const lendOptions = {
      ...options,
      receiver: options?.receiver || this.address,
    }

    // Get transaction details from provider
    const _lendTransaction = await this.provider.openPosition({
      amount,
      asset,
      marketId,
      options: lendOptions,
    })

    // TODO: Execute the transaction using wallet
    // For now, throw error - this needs to be implemented
    // based on how the wallet signs and sends transactions
    throw new Error(
      'Transaction execution not yet implemented in WalletLendNamespace',
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
