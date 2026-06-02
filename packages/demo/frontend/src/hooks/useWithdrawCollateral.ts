/**
 * Collateral-aware withdraw derivation for the Lend tab. When the lent asset
 * secures an open borrow position, a withdraw releases collateral; this hook
 * owns that cross-market math (projected health, CTA gating, shares to release)
 * so `Action` stays focused on the form.
 */

import { useContext, useMemo } from 'react'
import { parseUnits } from 'viem'
import type { Asset, BorrowMarketPosition } from '@eth-optimism/actions-sdk'
import { BorrowProviderContext } from '@/contexts/BorrowProviderContext'
import { useCollateralStatus } from '@/hooks/useCollateralStatus'
import { computeProjection } from '@/utils/borrowMath'
import { sameMarketId } from '@/utils/marketId'
import { stubPriceUsd } from '@/utils/stubPrices' // retired by #482
import type { BorrowHealthCardProps } from '@/components/earn/borrow/BorrowHealthCard'

export interface WithdrawCollateralState {
  /** The borrow position (if any) the lent asset is securing. */
  pledgedPosition: BorrowMarketPosition | null
  /** True when the withdraw should surface the projected-health card. */
  showHealthCard: boolean
  /** Projected position lands in the buffer zone (gate the CTA). */
  withdrawIntoBuffer: boolean
  /** Projected position would liquidate (gate the CTA). */
  withdrawWouldLiquidate: boolean
  /** User typed more than their available deposit. */
  exceedsDeposit: boolean
  /** Collateral shares to release alongside the withdraw, or null. */
  releaseCollateralAmountRaw: bigint | null
  /** Props for `<BorrowHealthCard>` / `<ReviewBorrowHealthModal>`, or null. */
  health: BorrowHealthCardProps | null
}

export function useWithdrawCollateral({
  asset,
  mode,
  amount,
  amountValue,
  maxAmount,
  directDepositedAmount,
}: {
  asset: Asset | null | undefined
  mode: 'lend' | 'withdraw'
  amount: string
  amountValue: number
  maxAmount: string
  directDepositedAmount: string | null | undefined
}): WithdrawCollateralState {
  const collateralStatus = useCollateralStatus(asset ?? null)
  const pledgedPosition = collateralStatus.positions[0] ?? null
  // Read via raw useContext so Lend tests don't need a provider wrapper.
  const borrowCtx = useContext(BorrowProviderContext)
  const borrowMarkets = borrowCtx?.markets ?? []
  const pledgedMarket = pledgedPosition
    ? (borrowMarkets.find((m) =>
        sameMarketId(m.marketId, pledgedPosition.marketId),
      ) ?? null)
    : null

  const showHealthCard = mode === 'withdraw' && !!pledgedPosition && !!asset

  const projection = useMemo(() => {
    if (!showHealthCard || !pledgedPosition || !asset) return null
    const collPrice = stubPriceUsd(asset.metadata.symbol)
    const borrPrice = stubPriceUsd(pledgedPosition.borrowAsset.metadata.symbol)
    const collValueUsd =
      parseFloat(pledgedPosition.collateralAmountFormatted || '0') * collPrice
    const borrValueUsd =
      parseFloat(pledgedPosition.borrowAmountFormatted || '0') * borrPrice
    const withdrawValueUsd = (parseFloat(amount) || 0) * collPrice
    const maxLtv = pledgedPosition.maxLtv ?? 0
    const bufferPct = pledgedMarket?.healthBufferPct ?? 0
    const currentLtv = collValueUsd > 0 ? borrValueUsd / collValueUsd : 0
    const result = computeProjection(
      { borrowValueUsd: borrValueUsd, collateralValueUsd: collValueUsd },
      { kind: 'withdrawCollateral', deltaValueUsd: withdrawValueUsd },
      maxLtv,
    )
    return {
      currentLtv,
      maxLtv,
      bufferPct,
      borrowApy: pledgedPosition.borrowApy,
      collValueUsd,
      projection: result,
    }
  }, [amount, asset, pledgedPosition, pledgedMarket, showHealthCard])

  const projectedLtv =
    projection && projection.projection.kind === 'projected'
      ? projection.projection.ltv
      : (projection?.currentLtv ?? 0)
  const projectedHealthFactor =
    projection && projection.projection.kind === 'projected'
      ? projection.projection.healthFactor
      : Number.POSITIVE_INFINITY
  const withdrawWouldLiquidate =
    projection?.projection.kind === 'wouldLiquidate'
  // Surface over-deposit separately so the Health card labels it "Exceeds deposit".
  const exceedsDeposit =
    mode === 'withdraw' && amountValue > parseFloat(maxAmount)
  const withdrawIntoBuffer =
    projection?.projection.kind === 'projected' &&
    projection.projection.ltv > projection.maxLtv * (1 - projection.bufferPct)

  const directDepositedValue = parseFloat(directDepositedAmount || '0')
  const releaseCollateralAmountRaw = useMemo(() => {
    if (
      mode !== 'withdraw' ||
      !pledgedPosition ||
      !asset ||
      amountValue <= directDepositedValue
    ) {
      return null
    }
    const collateralAmountRaw = parseUnits(
      (amountValue - directDepositedValue).toFixed(asset.metadata.decimals),
      asset.metadata.decimals,
    )
    if (collateralAmountRaw <= 0n || pledgedPosition.collateralAmount <= 0n) {
      return null
    }
    const numerator =
      collateralAmountRaw * pledgedPosition.collateralShares +
      pledgedPosition.collateralAmount -
      1n
    return numerator / pledgedPosition.collateralAmount
  }, [amountValue, asset, directDepositedValue, mode, pledgedPosition])

  const health: BorrowHealthCardProps | null =
    showHealthCard && projection && pledgedPosition
      ? {
          currentLtv: projection.currentLtv,
          projectedLtv,
          maxLtv: projection.maxLtv,
          bufferPct: projection.bufferPct,
          borrowApy: projection.borrowApy,
          collateralAsset: pledgedPosition.collateralAsset,
          collateralValueUsd: projection.collValueUsd,
          projectedHealthFactor,
          wouldLiquidate: withdrawWouldLiquidate || exceedsDeposit,
          exceedsDeposit,
        }
      : null

  return {
    pledgedPosition,
    showHealthCard,
    withdrawIntoBuffer: !!withdrawIntoBuffer,
    withdrawWouldLiquidate: !!withdrawWouldLiquidate,
    exceedsDeposit,
    releaseCollateralAmountRaw,
    health,
  }
}
