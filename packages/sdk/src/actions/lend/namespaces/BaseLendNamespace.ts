import type { Address } from 'viem'

import type { LendProvider } from '@/actions/lend/core/LendProvider.js'
import { findMarketInAllowlist } from '@/actions/lend/utils/markets.js'
import { BaseNamespace } from '@/actions/shared/BaseNamespace.js'
import { ProviderNotConfiguredError } from '@/core/error/errors.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type {
  GetLendMarketParams,
  GetLendMarketsParams,
  GetPositionsParams,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
} from '@/types/lend/index.js'
import type { LendProviders } from '@/types/providers.js'
import { validateWalletAddress } from '@/utils/validation.js'

export type { LendProviders } from '@/types/providers.js'

type ConfiguredLendProvider = LendProvider<LendProviderConfig>
type ActionsGetPositionsArgs = [
  walletAddress: Address,
  params?: GetPositionsParams,
]
export type WalletGetPositionsArgs = [params?: GetPositionsParams]
type GetPositionsArgs = ActionsGetPositionsArgs | WalletGetPositionsArgs

/**
 * Base Lend Namespace
 * @description Shared lending operations for Actions and Wallet namespaces.
 */
export abstract class BaseLendNamespace<
  TGetPositionsArgs extends GetPositionsArgs = ActionsGetPositionsArgs,
> extends BaseNamespace<ConfiguredLendProvider, LendProviders> {
  constructor(
    providers: LendProviders,
    private readonly getBoundWalletAddress?: () => Address,
  ) {
    super(providers)
  }

  /**
   * Get all markets across all configured providers
   * @param params - Optional filtering parameters
   * @returns Promise resolving to array of markets from all providers
   */
  async getMarkets(params: GetLendMarketsParams = {}): Promise<LendMarket[]> {
    const results = await Promise.all(
      this.getAllProviders().map((p) => p.getMarkets(params)),
    )
    return results.flat()
  }

  /**
   * Get a specific market by routing to the correct provider
   * @param params - Market identifier
   * @returns Promise resolving to market information
   */
  async getMarket(params: GetLendMarketParams): Promise<LendMarket> {
    const provider = this.getProviderForMarket(params)
    return provider.getMarket(params)
  }

  /**
   * @description Gets positions for an explicit or namespace-bound wallet.
   * @param args - Wallet address and filters, or wallet-scoped filters
   * @returns Promise resolving to the wallet's positions across providers
   * @throws AddressRequiredError, InvalidParamsError, or ChainNotSupportedError
   */
  async getPositions(
    ...args: TGetPositionsArgs
  ): Promise<LendMarketPosition[]> {
    const { walletAddress, params } = this.resolveGetPositionsArgs(args)
    const providers = params.provider
      ? [this.providers[params.provider]].filter(
          (provider): provider is ConfiguredLendProvider =>
            provider !== undefined,
        )
      : this.getAllProviders()

    const results = await Promise.all(
      providers.map((provider) => provider.getPositions(walletAddress, params)),
    )
    const positions = results.flat()

    return params.options?.nonZeroOnly
      ? positions.filter((position) => position.balance > 0n)
      : positions
  }

  /**
   * Route a market to the correct provider
   * @param marketId - Market identifier to route
   * @returns The provider that handles this market
   * @throws Error if no provider is found for the market
   */
  protected getProviderForMarket(
    marketId: LendMarketId,
  ): ConfiguredLendProvider {
    for (const provider of this.getAllProviders()) {
      if (findMarketInAllowlist(provider.config.marketAllowlist, marketId)) {
        return provider
      }
    }

    throw new ProviderNotConfiguredError({
      provider: marketId.address,
      details: `No provider configured for market on chain ${marketId.chainId}`,
    })
  }

  private resolveGetPositionsArgs(args: GetPositionsArgs): {
    walletAddress: Address
    params: GetPositionsParams
  } {
    if (typeof args[0] === 'string') {
      const [walletAddress, params = {}] = args
      validateWalletAddress(walletAddress)
      return { walletAddress, params }
    }

    const walletAddress = this.getBoundWalletAddress?.()
    validateWalletAddress(walletAddress)
    return { walletAddress, params: args[0] ?? {} }
  }
}
