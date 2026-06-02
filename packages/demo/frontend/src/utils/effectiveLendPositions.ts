/**
 * Merges each lend market's direct (in-vault) deposit with any of its shares
 * already pledged as collateral on an open borrow position, so the Lend tab
 * shows the user's full balance even after part of it became borrow collateral.
 */

import type { BorrowMarketPosition } from '@eth-optimism/actions-sdk'
import type { MarketInfo } from '@/components/earn/MarketSelector'
import type { MarketPosition } from '@/types/market'

function toAmount(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function findPledgedPosition(
  market: Pick<MarketPosition, 'asset'>,
  borrowPositions: readonly BorrowMarketPosition[],
): BorrowMarketPosition | null {
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
  borrowPositions: readonly BorrowMarketPosition[],
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
      const pledgedCollateralAmount = pledgedPosition
        ? pledgedPosition.collateralAmountFormatted
        : null
      const totalDepositedAmount = (
        toAmount(directDepositedAmount) + toAmount(pledgedCollateralAmount)
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
