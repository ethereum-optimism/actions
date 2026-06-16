import type { Address, Hex } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { BorrowProviderName, LendProviderName } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'

/**
 * Fields shared by every `BorrowMarketId` variant.
 */
interface BorrowMarketIdBase {
  /** Protocol-specific market identifier as a `0x`-prefixed hex string */
  marketId: Hex
  /** Chain the market is deployed on */
  chainId: SupportedChainId
}

/**
 * Identifier for a borrow market.
 * @description Tagged union designed to grow as additional protocols ship.
 * Carries the Morpho Blue variant (keccak of `MarketParams`) and the Aave V3
 * variant (synthetic id derived from chain + collateral/debt addresses, since
 * Aave has no params-hash market id). Comet / Liquity / Euler variants land
 * alongside their providers without breaking existing callers.
 */
export type BorrowMarketId =
  | (BorrowMarketIdBase & { kind: 'morpho-blue' })
  | (BorrowMarketIdBase & { kind: 'aave-v3' })

/**
 * Aave V3 market parameters for the synthetic (collateral, debt) pair model.
 * @description Aave is a shared multi-asset pool, so a borrow "market" is the
 * pairing of a collateral reserve and a debt reserve on a chain. Persisted
 * alongside the synthetic `marketId` so the provider can resolve reserves
 * without re-deriving them.
 */
export interface AaveBorrowMarketParams {
  /** Underlying address of the debt asset reserve (e.g. USDC) */
  debtReserve: Address
  /** Underlying address of the collateral reserve (e.g. WETH for ETH collateral) */
  collateralReserve: Address
  /** Whether collateral deposit/withdraw routes through the WETH gateway (native ETH) */
  collateralUsesWethGateway: boolean
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
   * Frontends use the resolved value to compute the safe-ceiling LTV;
   * not enforced by the SDK.
   */
  healthBufferPct?: number
}

/**
 * Discriminated config describing a single borrow market.
 * @description Each variant pairs a `BorrowMarketId` with the protocol-specific
 * configuration the provider needs to build calldata and read state. The params
 * live under a protocol-named key (`marketParams` for Morpho, `aave` for Aave)
 * rather than a shared `params` field on purpose: the two shapes are unrelated
 * (a single Morpho market vs. a synthetic Aave reserve pair), and the named key
 * makes the discriminant obvious at the call site without reading `kind`.
 */
export type BorrowMarketConfig =
  | (BorrowMarketIdBase &
      BorrowMarketConfigMetadata & {
        kind: 'morpho-blue'
        /**
         * Full Morpho Blue market parameters. Persisted alongside `marketId` so
         * the provider can encode write-side calldata without an extra RPC.
         */
        marketParams: MorphoMarketParams
      })
  | (BorrowMarketIdBase &
      BorrowMarketConfigMetadata & {
        kind: 'aave-v3'
        /** Aave V3 reserve pairing for the synthetic (collateral, debt) market. */
        aave: AaveBorrowMarketParams
      })

/** The Morpho Blue variant of `BorrowMarketConfig`. */
export type MorphoBorrowMarketConfig = Extract<
  BorrowMarketConfig,
  { kind: 'morpho-blue' }
>

/** The Aave V3 variant of `BorrowMarketConfig`. */
export type AaveBorrowMarketConfig = Extract<
  BorrowMarketConfig,
  { kind: 'aave-v3' }
>

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
  /**
   * Raw on-chain collateral balance held inside the borrow market. For
   * vault-wrapped collateral these are ERC-4626 shares; callers convert to
   * underlying-asset units via the vault when they need a display amount.
   */
  collateralShares: bigint
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

/** Params for `actions.borrow.getPosition`. */
export interface GetBorrowPositionParams {
  marketId: BorrowMarketId
  walletAddress: Address
}
