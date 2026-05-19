import type { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import { marketIdMatches } from '@/actions/borrow/core/marketId.js'
import { BaseNamespace } from '@/actions/shared/BaseNamespace.js'
import { ProviderNotConfiguredError } from '@/core/error/errors.js'
import type { BorrowProviderConfig } from '@/types/actions.js'
import type {
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowQuote,
  BorrowQuoteParams,
  GetBorrowMarketParams,
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
export abstract class BaseBorrowNamespace extends BaseNamespace<
  ConfiguredBorrowProvider,
  BorrowProviders
> {
  async getMarkets(
    params: GetBorrowMarketsParams = {},
  ): Promise<BorrowMarket[]> {
    const results = await Promise.all(
      this.getAllProviders().map((p) => p.getMarkets(params)),
    )
    return results.flat()
  }

  async getMarket(params: GetBorrowMarketParams): Promise<BorrowMarket> {
    return this.getProviderForMarket(params).getMarket(params)
  }

  async getPosition(
    params: GetBorrowPositionParams,
  ): Promise<BorrowMarketPosition> {
    return this.getProviderForMarket(params.marketId).getPosition(params)
  }

  /**
   * Build a `BorrowQuote` for any of the five borrow actions without
   * dispatching it. The `action` discriminator selects which provider verb
   * runs; the rest of the params match that verb's normal input.
   *
   * Useful for backend preview / confirmation endpoints that need
   * recipient-bound, expiring calldata. Callers must supply
   * `walletAddress` directly on read-only namespaces; the wallet
   * namespace's overrides inject it from the connected wallet.
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
   * @description Falls back to discriminator routing (Morpho-Blue → morpho)
   * when no allowlist hit is found — useful in tests where providers were
   * spun up without explicit allowlists. Throws if no provider is registered
   * for the market's protocol.
   */
  protected getProviderForMarket(
    marketId: BorrowMarketId,
  ): ConfiguredBorrowProvider {
    for (const provider of this.getAllProviders()) {
      const allowlist = provider.config.marketAllowlist
      if (
        allowlist?.some((m: BorrowMarketConfig) => marketIdMatches(m, marketId))
      ) {
        return provider
      }
    }

    if (marketId.kind === 'morpho-blue') {
      const morpho = this.providers.morpho
      if (morpho) return morpho
    }

    throw new ProviderNotConfiguredError({
      provider: marketId.marketId,
      details: `No borrow provider configured for market on chain ${marketId.chainId}`,
    })
  }
}
