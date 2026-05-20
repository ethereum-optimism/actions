import type { Address, Hex } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { BorrowProviderName, LendProviderName } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'

/**
 * Identifier for a borrow market.
 * @description Tagged union designed to grow as additional protocols ship.
 * PR #3 only carries the Morpho Blue variant; Aave / Comet / Liquity / Euler
 * variants will land alongside their respective providers without breaking
 * existing callers.
 */
export type BorrowMarketId = {
  kind: 'morpho-blue'
  /** keccak256 hash of MarketParams; Morpho Blue's canonical market id */
  marketId: Hex
  /** Chain the market is deployed on */
  chainId: SupportedChainId
}

/**
 * Morpho Blue market parameter struct.
 * @description Mirrors the `MarketParams` struct in `IMorpho.sol`. The
 * keccak256 of the abi-encoded tuple is the Morpho Blue `marketId`.
 */
export interface MorphoMarketParams {
  /** Token that can be borrowed from this market */
  loanToken: Address
  /** Token deposited as collateral */
  collateralToken: Address
  /** Oracle providing the loan/collateral price */
  oracle: Address
  /** Interest rate model address */
  irm: Address
  /** Liquidation loan-to-value, WAD-scaled (1e18 = 100%) */
  lltv: bigint
}

/**
 * Metadata fields shared across every borrow market variant.
 * @description Combined with the protocol-specific tag/params to form
 * `BorrowMarketConfig`.
 */
export interface BorrowMarketConfigMetadata {
  /** Human-readable market name */
  name: string
  /** Asset deposited as collateral */
  collateralAsset: Asset
  /** Asset borrowed from the market */
  borrowAsset: Asset
  /** Borrow provider that services this market */
  borrowProvider: BorrowProviderName
  /**
   * Lend provider that issues the collateral token, when collateral is a
   * yield-bearing receipt (e.g. a Morpho vault share). Informational; lets
   * frontends coordinate cross-namespace flows.
   */
  lendProvider?: LendProviderName
  /**
   * Optional per-market override for `BorrowSettings.healthBufferPct`
   * (Decision 7). Frontends use the resolved value to compute the
   * safe-ceiling LTV; not enforced by the SDK.
   */
  healthBufferPct?: number
}

/**
 * Discriminated config describing a single borrow market.
 * @description Each variant pairs a `BorrowMarketId` with the protocol-specific
 * configuration the provider needs to build calldata and read state.
 */
export type BorrowMarketConfig = BorrowMarketId &
  BorrowMarketConfigMetadata & {
    kind: 'morpho-blue'
    /**
     * Full Morpho Blue market parameters. Persisted alongside `marketId` so
     * the provider can encode write-side calldata without an extra RPC.
     */
    marketParams: MorphoMarketParams
  }

/**
 * Public information about a borrow market.
 * @description Returned from `actions.borrow.getMarket` /
 * `actions.borrow.getMarkets`. Frontends consume this directly.
 */
export interface BorrowMarket {
  /** Market identifier */
  marketId: BorrowMarketId
  /** Human-readable market name */
  name: string
  /** Collateral asset */
  collateralAsset: Asset
  /** Borrow asset */
  borrowAsset: Asset
  /** Current borrow APY as a decimal fraction (e.g. 0.045 = 4.5%) */
  borrowApy: number
  /** Liquidation bonus paid to liquidators as a decimal (e.g. 0.05 = 5%) */
  liquidationBonus: number
  /** Liquidation LTV (LLTV) as a decimal fraction */
  maxLtv: number
  /**
   * Resolved safety buffer for this market, expressed as a decimal
   * (`market.healthBufferPct ?? settings.healthBufferPct ?? 0.05`).
   * Surfaced on the read shape so consumers don't have to mirror the
   * resolution rule themselves.
   */
  healthBufferPct: number
  /** Total assets currently borrowed from the market (wei) */
  totalBorrowed: bigint
  /** Total collateral supplied to the market (wei) */
  totalCollateral: bigint
}

/**
 * A wallet's position in a borrow market.
 * @description Both raw bigint and pre-formatted strings are surfaced so
 * frontends can render without re-deriving decimal scaling.
 */
export interface BorrowMarketPosition {
  /** Market identifier */
  marketId: BorrowMarketId
  /** Collateral asset metadata */
  collateralAsset: Asset
  /** Collateral balance in wei */
  collateralAmount: bigint
  /** Pre-formatted collateral balance */
  collateralAmountFormatted: string
  /** Borrow asset metadata */
  borrowAsset: Asset
  /** Accrued debt in wei (loan asset units) */
  borrowAmount: bigint
  /** Pre-formatted accrued debt */
  borrowAmountFormatted: string
  /**
   * Health factor as a decimal. `null` when no debt is outstanding;
   * `null` rather than `Infinity` keeps the type JSON-serializable.
   */
  healthFactor: number | null
  /** Collateral price (in loan-asset units) at which the position liquidates */
  liquidationPrice: bigint
  /** Pre-formatted liquidation price */
  liquidationPriceFormatted: string
  /** Current borrow APY snapshot (fraction) */
  borrowApy: number
  /** Liquidation bonus (fraction) */
  liquidationBonus: number
  /** Current LTV as a fraction. `null` when no debt is outstanding. */
  ltv: number | null
  /** Liquidation LTV as a fraction */
  maxLtv: number
}

/** Filter parameters for `actions.borrow.getMarkets`. */
export interface GetBorrowMarketsParams {
  /** Filter to markets whose `collateralAsset` matches */
  collateralAsset?: Asset
  /** Filter to markets whose `borrowAsset` matches */
  borrowAsset?: Asset
  /** Filter to markets on a specific chain */
  chainId?: SupportedChainId
  /** Pre-filtered market configs (used internally by the provider) */
  markets?: BorrowMarketConfig[]
}

/** Identifier params for `actions.borrow.getMarket`. */
export type GetBorrowMarketParams = BorrowMarketId

/** Params for `actions.borrow.getPosition`. */
export interface GetBorrowPositionParams {
  marketId: BorrowMarketId
  walletAddress: Address
}
