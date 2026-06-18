/**
 * Merges each lend market's direct (in-vault) deposit with any of its shares
 * already pledged as collateral on an open borrow position, so the Lend tab
 * shows the user's full balance even after part of it became borrow collateral.
 */

import type { MarketInfo } from '@/components/earn/MarketSelector'
import type { BorrowPosition, MarketPosition } from '@/types/market'

function toAmount(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function findPledgedPosition(
  market: Pick<MarketPosition, 'asset'>,
  borrowPositions: readonly BorrowPosition[],
): BorrowPosition | null {
  return (
    borrowPositions.find(
      (position) =>
        position.collateralAsset.metadata.symbol ===
        market.asset.metadata.symbol,
    ) ?? null
  )
}

export function buildEffectiveLendPositions(
  markets: readonly MarketInfo[],
  directPositions: readonly MarketPosition[],
  borrowPositions: readonly BorrowPosition[],
): MarketPosition[] {
  return markets
    .map((market) => {
      const directPosition =
        directPositions.find(
          (position) =>
            position.marketId.address.toLowerCase() ===
              market.marketId.address.toLowerCase() &&
            position.marketId.chainId === market.marketId.chainId,
        ) ?? null
      const pledgedPosition = findPledgedPosition(
        directPosition ?? {
          asset: market.asset,
        },
        borrowPositions,
      )
      const directDepositedAmount =
        directPosition?.directDepositedAmount ?? null
      // Aave: lend deposit and borrow collateral are the same aToken, so don't add them twice.
      // Morpho: vault shares leave the vault when pledged, so they are distinct and do sum.
      // Prefer the live borrow position's collateral; fall back to an optimistic
      // pledge recorded on the lend position (set the instant the auto-reconcile
      // fires, before the borrow position refetches) so the displayed total stays
      // stable instead of briefly double-counting the moved shares.
      const pledgedCollateralAmount =
        market.provider !== 'aave'
          ? (pledgedPosition?.collateralAmountFormatted ??
            directPosition?.pledgedCollateralAmount ??
            null)
          : null
      // Floor (not round) to 2 dp: the displayed deposit doubles as withdraw Max, so rounding up could exceed actual collateral.
      const totalDepositedAmount = (
        Math.floor(
          (toAmount(directDepositedAmount) +
            toAmount(pledgedCollateralAmount)) *
            100,
        ) / 100
      ).toFixed(2)

      if (toAmount(totalDepositedAmount) <= 0) return null

      return {
        marketName: market.name,
        marketLogo: market.logo,
        networkName: market.networkName,
        networkLogo: market.networkLogo,
        asset: market.asset,
        assetLogo: market.assetLogo,
        apy: directPosition?.apy ?? market.apy,
        depositedAmount: totalDepositedAmount,
        directDepositedAmount,
        depositedShares: directPosition?.depositedShares ?? null,
        depositedSharesRaw: directPosition?.depositedSharesRaw ?? null,
        directDepositedShares: directPosition?.directDepositedShares ?? null,
        directDepositedSharesRaw:
          directPosition?.directDepositedSharesRaw ?? null,
        pledgedCollateralAmount,
        isLoadingApy: directPosition?.isLoadingApy ?? false,
        isLoadingPosition: directPosition?.isLoadingPosition ?? false,
        marketId: market.marketId,
        provider: market.provider,
      } satisfies MarketPosition
    })
    .filter((position): position is MarketPosition => position !== null)
}
