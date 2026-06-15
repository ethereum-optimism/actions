import type { Asset, BorrowMarketPosition } from '@eth-optimism/actions-sdk'

/**
 * Borrow position enriched with the underlying-collateral amount the demo
 * derives client-side. The SDK returns only raw `collateralShares`; for the
 * demo's vault-wrapped collateral the frontend converts shares to underlying
 * via the vault's `convertToAssets`.
 */
export type BorrowPosition = BorrowMarketPosition & {
  collateralAmount: bigint
  collateralAmountFormatted: string
}

export interface MarketPosition {
  marketName: string
  marketLogo: string
  networkName: string
  networkLogo: string
  asset: Asset
  assetLogo: string
  apy: number | null
  depositedAmount: string | null
  directDepositedAmount: string | null
  depositedShares: string | null
  depositedSharesRaw: bigint | null
  directDepositedShares: string | null
  directDepositedSharesRaw: bigint | null
  pledgedCollateralAmount: string | null
  isLoadingApy: boolean
  isLoadingPosition: boolean
  marketId: {
    address: string
    chainId: number
  }
  provider: 'morpho' | 'aave'
}
