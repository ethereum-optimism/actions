import type { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import { marketIdMatches } from '@/actions/borrow/core/markets.js'
import { BaseNamespace } from '@/actions/shared/BaseNamespace.js'
import { findMatchingConfig } from '@/actions/shared/marketConfigs.js'
import { ProviderNotConfiguredError } from '@/core/error/errors.js'
import type { BorrowProviderConfig } from '@/types/actions.js'
import type {
  BorrowMarket,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowQuote,
  BorrowQuoteParams,
  GetBorrowMarketsParams,
  GetBorrowPositionParams,
} from '@/types/borrow/index.js'
import type { BorrowProviders } from '@/types/providers.js'

type ConfiguredBorrowProvider = BorrowProvider<BorrowProviderConfig>

/**
 * Base namespace for borrow read operations.
 * @description Shared by `ActionsBorrowNamespace` (read-only) and
 * `WalletBorrowNamespace` (wallet-bound). Provider selection routes by
 * `marketId.kind` plus allowlist membership; once additional borrow
 * providers ship (Aave, Comet, …) the routing layer here is what picks
 * the right concrete provider for a given market.
 */
export class BaseBorrowNamespace extends BaseNamespace<
  ConfiguredBorrowProvider,
  BorrowProviders
> {
  /**
   * List borrow markets across configured providers.
   * @description Returns successful provider results and ignores provider
   * read failures so one unavailable protocol does not hide healthy markets.
   * @param params - Optional chain and asset filters.
   * @returns Borrow markets from all providers that fulfilled the read.
   * @throws ChainNotSupportedError when a provider rejects an unsupported chain.
   */
  async getMarkets(
    params: GetBorrowMarketsParams = {},
  ): Promise<BorrowMarket[]> {
    const results = await Promise.allSettled(
      this.getAllProviders().map((p) => p.getMarkets(params)),
    )
    return results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    )
  }

  /**
   * Read a single borrow market.
   * @description Selects the provider whose allowlist contains the market,
   * then delegates the protocol read.
   * @param marketId - Market identifier to read.
   * @returns Borrow market data for the selected market.
   * @throws ProviderNotConfiguredError when no provider can service the market.
   */
  async getMarket(marketId: BorrowMarketId): Promise<BorrowMarket> {
    return this.getProviderForMarket(marketId).getMarket(marketId)
  }

  /**
   * Read a wallet position in a borrow market.
   * @description Selects the provider whose allowlist contains the market,
   * then delegates the wallet-position read.
   * @param params - Market identifier and wallet address to inspect.
   * @returns Wallet position data for the selected market.
   * @throws ProviderNotConfiguredError when no provider can service the market.
   */
  async getPosition(
    params: GetBorrowPositionParams,
  ): Promise<BorrowMarketPosition> {
    return this.getProviderForMarket(params.marketId).getPosition(params)
  }

  /**
   * Build a borrow quote without dispatching it.
   * @description The `action` discriminator selects which provider verb runs.
   * Useful for backend preview endpoints that need wallet-bound, expiring
   * calldata. Read-only callers must supply `walletAddress`; wallet
   * namespaces inject it from the connected wallet.
   * @param params - Discriminated borrow quote parameters.
   * @returns Borrow quote with projected position changes and execution data.
   * @throws ProviderNotConfiguredError when no provider can service the market.
   */
  async getQuote(params: BorrowQuoteParams): Promise<BorrowQuote> {
    const provider = this.getProviderForMarket(params.market)
    switch (params.action) {
      case 'open':
        return provider.openPosition(params)
      case 'close':
        return provider.closePosition(params)
      case 'depositCollateral':
        return provider.depositCollateral(params)
      case 'withdrawCollateral':
        return provider.withdrawCollateral(params)
      case 'repay':
        return provider.repay(params)
    }
  }

  /**
   * Pick the provider whose allowlist contains this market.
   * @description Falls back to routing by the market's `kind` discriminator
   * when no allowlist hit is found (covers providers configured without an
   * explicit allowlist). Each provider declares the kind it services, so this
   * stays generic as new borrow providers ship. Throws if no provider is
   * registered for the market's protocol.
   */
  protected getProviderForMarket(
    marketId: BorrowMarketId,
  ): ConfiguredBorrowProvider {
    for (const provider of this.getAllProviders()) {
      if (
        findMatchingConfig({
          configs: provider.config.marketAllowlist,
          target: marketId,
          matches: marketIdMatches,
        })
      ) {
        return provider
      }
    }

    for (const provider of this.getAllProviders()) {
      if (provider.marketKind === marketId.kind) return provider
    }

    throw new ProviderNotConfiguredError({
      provider: marketId.marketId,
      details: `No borrow provider configured for market on chain ${marketId.chainId}`,
    })
  }
}
