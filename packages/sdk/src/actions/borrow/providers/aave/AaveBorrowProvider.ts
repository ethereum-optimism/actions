import type { Address } from 'viem'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import {
  assembleAaveBorrowQuote,
  toAaveBorrowMarket,
  toAaveBorrowPosition,
} from '@/actions/borrow/providers/aave/presentation.js'
import {
  type AaveQuoteArgs,
  buildAaveCloseQuoteArgs,
  buildAaveDepositCollateralQuoteArgs,
  buildAaveOpenQuoteArgs,
  buildAaveRepayQuoteArgs,
  buildAaveWithdrawCollateralQuoteArgs,
} from '@/actions/borrow/providers/aave/quote.js'
import {
  fetchAaveMarketState,
  fetchAavePositionState,
} from '@/actions/borrow/providers/aave/state.js'
import {
  getPoolAddress,
  getSupportedChainIds as getAaveSupportedChainIds,
} from '@/actions/shared/aave/addresses.js'
import { ChainNotSupportedError } from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { BorrowProviderConfig, BorrowSettings } from '@/types/actions.js'
import type {
  AaveBorrowMarketConfig,
  BorrowClosePositionInternalParams,
  BorrowDepositCollateralInternalParams,
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketPosition,
  BorrowOpenPositionInternalParams,
  BorrowQuote,
  BorrowRepayInternalParams,
  BorrowWithdrawCollateralInternalParams,
  GetBorrowMarketsParams,
} from '@/types/borrow/index.js'

/**
 * Aave V3 borrow provider. Models a borrow market as the synthetic
 * (collateral, debt) reserve pair on the `aave-v3` config, read via multicall
 * against the shared Aave Pool. Variable-rate debt only.
 */
export class AaveBorrowProvider extends BorrowProvider<BorrowProviderConfig> {
  constructor(
    config: BorrowProviderConfig,
    chainManager: ChainManager,
    settings?: BorrowSettings,
  ) {
    super(config, chainManager, settings)
    assertAaveMarketChainsSupported(config.marketAllowlist)
  }

  /** Services Aave V3 borrow markets. */
  public get marketKind(): 'aave-v3' {
    return 'aave-v3'
  }

  protocolSupportedChainIds(): number[] {
    return getAaveSupportedChainIds()
  }

  // ── Read hooks ────────────────────────────────────────────────────────────

  protected async _getMarket(
    rawMarket: BorrowMarketConfig,
  ): Promise<BorrowMarket> {
    const market = this.requireAaveMarket(rawMarket)
    const client = this.chainManager.getPublicClient(market.chainId)
    const state = await fetchAaveMarketState(client, market)
    const healthBufferPct = this.resolveHealthBufferPct(market)
    return toAaveBorrowMarket(market, state, healthBufferPct)
  }

  protected async _getMarkets(
    params: GetBorrowMarketsParams,
  ): Promise<BorrowMarket[]> {
    const markets = params.markets ?? []
    const results = await Promise.allSettled(
      markets.map((market) => this._getMarket(market)),
    )
    return results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    )
  }

  protected async _getPosition(params: {
    market: BorrowMarketConfig
    walletAddress: Address
  }): Promise<BorrowMarketPosition> {
    const market = this.requireAaveMarket(params.market)
    const client = this.chainManager.getPublicClient(market.chainId)
    const state = await fetchAavePositionState(
      client,
      market,
      params.walletAddress,
    )
    return toAaveBorrowPosition(market, state)
  }

  // ── Write hooks ───────────────────────────────────────────────────────────

  protected async _openPosition(
    params: BorrowOpenPositionInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveMarket(params.market)
    const client = this.chainManager.getPublicClient(market.chainId)
    return this.assembleQuote(
      await buildAaveOpenQuoteArgs(client, market, params),
      params.walletAddress,
    )
  }

  protected async _repay(
    params: BorrowRepayInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveMarket(params.market)
    const client = this.chainManager.getPublicClient(market.chainId)
    return this.assembleQuote(
      await buildAaveRepayQuoteArgs(client, market, params),
      params.walletAddress,
    )
  }

  protected async _depositCollateral(
    params: BorrowDepositCollateralInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveMarket(params.market)
    const client = this.chainManager.getPublicClient(market.chainId)
    return this.assembleQuote(
      await buildAaveDepositCollateralQuoteArgs(client, market, params),
      params.walletAddress,
    )
  }

  protected async _withdrawCollateral(
    params: BorrowWithdrawCollateralInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveMarket(params.market)
    const client = this.chainManager.getPublicClient(market.chainId)
    return this.assembleQuote(
      await buildAaveWithdrawCollateralQuoteArgs(client, market, params),
      params.walletAddress,
    )
  }

  protected async _closePosition(
    params: BorrowClosePositionInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveMarket(params.market)
    const client = this.chainManager.getPublicClient(market.chainId)
    return this.assembleQuote(
      await buildAaveCloseQuoteArgs(client, market, params),
      params.walletAddress,
    )
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private requireAaveMarket(
    market: BorrowMarketConfig,
  ): AaveBorrowMarketConfig {
    if (market.kind !== 'aave-v3') {
      throw new Error(
        `AaveBorrowProvider received a ${market.kind} market config`,
      )
    }
    return market
  }

  private assembleQuote(args: AaveQuoteArgs, recipient: Address): BorrowQuote {
    return assembleAaveBorrowQuote({
      ...args,
      recipient,
      quoteExpirationSeconds: this.quoteExpirationSeconds,
      healthBufferPct: this.resolveHealthBufferPct(args.market),
    })
  }
}

/**
 * Fail fast when an `aave-v3` allowlist entry targets a chain without an Aave
 * deployment, so a misconfiguration surfaces at construction rather than on the
 * first call. Other market kinds belong to their own provider and are skipped.
 * @throws ChainNotSupportedError for an aave-v3 market on an unsupported chain.
 */
function assertAaveMarketChainsSupported(
  allowlist: readonly BorrowMarketConfig[] | undefined,
): void {
  for (const market of allowlist ?? []) {
    if (market.kind !== 'aave-v3') continue
    if (!getPoolAddress(market.chainId)) {
      throw new ChainNotSupportedError({
        chainId: market.chainId,
        supportedChainIds: getAaveSupportedChainIds(),
      })
    }
  }
}
