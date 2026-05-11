import {
  AccrualPosition,
  Market,
  type MarketId,
  MarketParams,
} from '@morpho-org/blue-sdk'
import { blueAbi, blueOracleAbi } from '@morpho-org/blue-sdk-viem'
import { type Address, formatUnits, type Hex } from 'viem'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import {
  getMorphoContracts,
  getSupportedChainIds as getMorphoSupportedChainIds,
} from '@/actions/shared/morpho/contracts.js'
import {
  computeMorphoMarketId,
  verifyMorphoMarketId,
} from '@/actions/shared/morpho/marketParams.js'
import { BorrowMarketParamsMismatchError } from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { BorrowProviderConfig, BorrowSettings } from '@/types/actions.js'
import type {
  BorrowClosePositionInternalParams,
  BorrowDepositCollateralInternalParams,
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowOpenPositionInternalParams,
  BorrowQuote,
  BorrowRepayInternalParams,
  BorrowWithdrawCollateralInternalParams,
  GetBorrowMarketsParams,
  GetBorrowPositionParams,
  MorphoMarketParams,
} from '@/types/borrow/index.js'

/** Wad denominator for converting Morpho's 1e18-scaled values to fractions. */
const WAD = 10n ** 18n

/**
 * Morpho Blue borrow provider.
 * @description Concrete `BorrowProvider` for Morpho Blue's borrow markets.
 * Reads happen in one multicall round-trip per call (`Morpho.position`,
 * `Morpho.market`, `IOracle.price`) — the results are fed into Morpho's
 * official `Market` / `AccrualPosition` classes so we reuse the SDK's
 * accrual / health-factor / liquidation-price math without depending on
 * `@morpho-org/blue-sdk`'s per-chain registry (which does not yet include
 * the demo's `baseSepolia` deployment). The write side ships in a
 * follow-up commit.
 */
export class MorphoBorrowProvider extends BorrowProvider<BorrowProviderConfig> {
  constructor(
    config: BorrowProviderConfig,
    chainManager: ChainManager,
    settings?: BorrowSettings,
  ) {
    super(config, chainManager, settings)
    this.verifyAllowlistMarketIds(config.marketAllowlist)
  }

  protocolSupportedChainIds(): number[] {
    return getMorphoSupportedChainIds()
  }

  protected async _getMarket(marketId: BorrowMarketId): Promise<BorrowMarket> {
    const config = this.requireAllowlistMarket(marketId)
    const market = await this.fetchMarket(config)
    return this.adaptMarket(config, market)
  }

  protected async _getMarkets(
    params: GetBorrowMarketsParams,
  ): Promise<BorrowMarket[]> {
    const configs = params.markets ?? this._config.marketAllowlist ?? []
    return Promise.all(
      configs.map(async (config) => {
        const market = await this.fetchMarket(config)
        return this.adaptMarket(config, market)
      }),
    )
  }

  protected async _getPosition(
    params: GetBorrowPositionParams,
  ): Promise<BorrowMarketPosition> {
    const config = this.requireAllowlistMarket(params.marketId)
    const accrualPosition = await this.fetchPosition(
      config,
      params.walletAddress,
    )
    return this.adaptPosition(config, accrualPosition)
  }

  // The write-side hooks land in a follow-up commit; for now they throw so
  // the abstract base remains satisfied and tests can target read paths.

  protected async _openPosition(
    _params: BorrowOpenPositionInternalParams,
  ): Promise<BorrowQuote> {
    throw new Error('MorphoBorrowProvider._openPosition not yet implemented')
  }

  protected async _closePosition(
    _params: BorrowClosePositionInternalParams,
  ): Promise<BorrowQuote> {
    throw new Error('MorphoBorrowProvider._closePosition not yet implemented')
  }

  protected async _depositCollateral(
    _params: BorrowDepositCollateralInternalParams,
  ): Promise<BorrowQuote> {
    throw new Error(
      'MorphoBorrowProvider._depositCollateral not yet implemented',
    )
  }

  protected async _withdrawCollateral(
    _params: BorrowWithdrawCollateralInternalParams,
  ): Promise<BorrowQuote> {
    throw new Error(
      'MorphoBorrowProvider._withdrawCollateral not yet implemented',
    )
  }

  protected async _repay(
    _params: BorrowRepayInternalParams,
  ): Promise<BorrowQuote> {
    throw new Error('MorphoBorrowProvider._repay not yet implemented')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Synchronously verify that every allowlisted market's `marketId` matches
   * `keccak256(abi.encode(marketParams))`. Misconfigured deployments fail
   * fast at SDK construction rather than producing silently incorrect
   * calldata at first use.
   */
  private verifyAllowlistMarketIds(
    allowlist: BorrowMarketConfig[] | undefined,
  ): void {
    if (!allowlist?.length) return
    for (const market of allowlist) {
      if (market.kind !== 'morpho-blue') continue
      if (!verifyMorphoMarketId(market.marketId, market.marketParams)) {
        throw new BorrowMarketParamsMismatchError({
          marketId: market.marketId,
          computedMarketId: computeMorphoMarketId(market.marketParams),
        })
      }
    }
  }

  /**
   * Look up a `BorrowMarketConfig` from the allowlist by id.
   * @description Decoupling the read methods from the allowlist would force
   * an extra `idToMarketParams` RPC. Locking it instead keeps `_getMarket`
   * and `_getPosition` at one round-trip.
   */
  private requireAllowlistMarket(marketId: BorrowMarketId): BorrowMarketConfig {
    const allowlist = this._config.marketAllowlist ?? []
    const match = allowlist.find(
      (m) =>
        m.kind === marketId.kind &&
        m.chainId === marketId.chainId &&
        m.marketId.toLowerCase() === marketId.marketId.toLowerCase(),
    )
    if (!match) {
      throw new BorrowMarketParamsMismatchError({
        marketId: marketId.marketId,
        computedMarketId:
          'No matching market in allowlist; supply marketParams via config',
      })
    }
    return match
  }

  /**
   * Read market state + oracle price in one multicall. Constructs a
   * `Market` instance locally so we reuse Morpho's math (accrual rate,
   * APY, liquidation incentive) without depending on
   * `@morpho-org/blue-sdk`'s per-chain registry.
   */
  private async fetchMarket(config: BorrowMarketConfig): Promise<Market> {
    const client = this.chainManager.getPublicClient(config.chainId)
    const morphoBlue = requireMorphoBlueAddress(config.chainId)
    const id = config.marketId as Hex
    const [marketTuple, price] = await client.multicall({
      allowFailure: false,
      contracts: [
        {
          address: morphoBlue,
          abi: blueAbi,
          functionName: 'market',
          args: [id],
        },
        {
          address: config.marketParams.oracle,
          abi: blueOracleAbi,
          functionName: 'price',
          args: [],
        },
      ],
    })

    return buildMarket(config, marketTuple, price)
  }

  /**
   * Read the user's position alongside market + oracle in one multicall.
   * Builds an `AccrualPosition` locally so the SDK's getters
   * (`healthFactor`, `ltv`, `liquidationPrice`, `borrowAssets`) compute on
   * up-to-date state regardless of which chain the market lives on.
   */
  private async fetchPosition(
    config: BorrowMarketConfig,
    user: Address,
  ): Promise<AccrualPosition> {
    const client = this.chainManager.getPublicClient(config.chainId)
    const morphoBlue = requireMorphoBlueAddress(config.chainId)
    const id = config.marketId as Hex
    const [positionTuple, marketTuple, price] = await client.multicall({
      allowFailure: false,
      contracts: [
        {
          address: morphoBlue,
          abi: blueAbi,
          functionName: 'position',
          args: [id, user],
        },
        {
          address: morphoBlue,
          abi: blueAbi,
          functionName: 'market',
          args: [id],
        },
        {
          address: config.marketParams.oracle,
          abi: blueOracleAbi,
          functionName: 'price',
          args: [],
        },
      ],
    })

    const market = buildMarket(config, marketTuple, price)
    const [supplyShares, borrowShares, collateral] = positionTuple
    return new AccrualPosition(
      {
        user,
        supplyShares,
        borrowShares,
        collateral,
      },
      market,
    )
  }

  private adaptMarket(
    config: BorrowMarketConfig,
    market: Market,
  ): BorrowMarket {
    return {
      marketId: {
        kind: config.kind,
        marketId: config.marketId,
        chainId: config.chainId,
      },
      name: config.name,
      collateralAsset: config.collateralAsset,
      borrowAsset: config.borrowAsset,
      borrowApy: wadToNumber(market.borrowApy),
      liquidationBonus: liquidationBonusFromIncentive(
        market.params.liquidationIncentiveFactor,
      ),
      maxLtv: wadToNumber(config.marketParams.lltv),
      totalBorrowed: market.totalBorrowAssets,
      // Morpho doesn't expose aggregate collateral as a single accumulator —
      // it would require summing per-user balances. Frontends that need the
      // figure can derive it from indexer data; we surface `0n` rather than
      // a misleading number.
      totalCollateral: 0n,
    }
  }

  private adaptPosition(
    config: BorrowMarketConfig,
    position: AccrualPosition,
  ): BorrowMarketPosition {
    const hasDebt = position.borrowAssets > 0n
    const ltvFraction = hasDebt ? toFractionOrNull(position.ltv) : null
    const hfFraction = hasDebt ? toFractionOrNull(position.healthFactor) : null
    const liquidationPrice = position.liquidationPrice ?? 0n
    return {
      marketId: {
        kind: config.kind,
        marketId: config.marketId,
        chainId: config.chainId,
      },
      collateralAsset: config.collateralAsset,
      collateralAmount: position.collateral,
      collateralAmountFormatted: formatUnits(
        position.collateral,
        config.collateralAsset.metadata.decimals,
      ),
      borrowAsset: config.borrowAsset,
      borrowAmount: position.borrowAssets,
      borrowAmountFormatted: formatUnits(
        position.borrowAssets,
        config.borrowAsset.metadata.decimals,
      ),
      healthFactor: hfFraction,
      liquidationPrice,
      liquidationPriceFormatted: formatUnits(
        liquidationPrice,
        config.borrowAsset.metadata.decimals,
      ),
      borrowApy: wadToNumber(position.market.borrowApy),
      liquidationBonus: liquidationBonusFromIncentive(
        position.market.params.liquidationIncentiveFactor,
      ),
      ltv: ltvFraction,
      maxLtv: wadToNumber(config.marketParams.lltv),
    }
  }
}

function wadToNumber(value: bigint): number {
  return Number(value) / Number(WAD)
}

function toFractionOrNull(value: bigint | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return wadToNumber(value)
}

/**
 * Morpho's `liquidationIncentiveFactor` is `WAD + bonus`. Subtract WAD to
 * recover the bonus fraction (e.g., `1.05e18 → 0.05`).
 */
function liquidationBonusFromIncentive(factor: bigint): number {
  if (factor <= WAD) return 0
  return wadToNumber(factor - WAD)
}

function requireMorphoBlueAddress(chainId: number): Address {
  const contracts = getMorphoContracts(chainId)
  if (!contracts) {
    throw new Error(
      `Morpho Blue contracts not configured for chain id ${chainId}`,
    )
  }
  return contracts.morphoBlue
}

/**
 * Compose Morpho's `Market` from the raw `market()` tuple plus oracle price.
 * @description `blueAbi.market(id)` returns
 * `[totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee]`
 * as uint128/uint128/uint128/uint128/uint128/uint128.
 */
function buildMarket(
  config: BorrowMarketConfig,
  marketTuple: readonly [bigint, bigint, bigint, bigint, bigint, bigint],
  price: bigint,
): Market {
  const [
    totalSupplyAssets,
    totalSupplyShares,
    totalBorrowAssets,
    totalBorrowShares,
    lastUpdate,
    fee,
  ] = marketTuple
  return new Market({
    params: new MarketParams({
      loanToken: config.marketParams.loanToken,
      collateralToken: config.marketParams.collateralToken,
      oracle: config.marketParams.oracle,
      irm: config.marketParams.irm,
      lltv: config.marketParams.lltv,
    }),
    totalSupplyAssets,
    totalSupplyShares,
    totalBorrowAssets,
    totalBorrowShares,
    lastUpdate,
    fee,
    price,
  })
}

export type { MarketId, MorphoMarketParams }
