/**
 * Borrow tab form.
 *
 * Composes ModeToggle (Borrow / Repay) + AmountSection (with optional
 * token-chip selector) + BorrowHealthCard (with live projection) +
 * CtaButton + Asset modal + Review modal + TransactionModal + Toast.
 *
 * The projection (LTV, HF, would-liquidate) is sourced from
 * `borrowApi.getQuote` via `useBorrowQuotePreview`, with a local
 * stub-price fallback in `useBorrowProjection`. Local stub-price math is
 * also kept for the synchronous Max button prefill.
 */

import { useMemo, useState } from 'react'
import type { BorrowMarket } from '@eth-optimism/actions-sdk'
import { stubPriceUsd } from '@/utils/stubPrices' // retired by #482
import { useBorrowProviderContext } from '@/contexts/BorrowProviderContext'
import { useBorrowQuotePreview } from '@/hooks/useBorrowQuotePreview'
import { useBorrowProjection } from '@/hooks/useBorrowProjection'
import { useBorrowTransaction } from '@/hooks/useBorrowTransaction'
import {
  computeMaxBorrowSafeUsd,
  computeSafeCeilingLtv,
} from '@/utils/borrowMath'
import {
  directLendPositionUsd,
  lendPositionUsd,
  positionUsd,
} from '@/utils/borrowValuation'
import { sameMarketId } from '@/utils/marketId'
import type { MarketPosition } from '@/types/market'
import { CtaButton } from '../CtaButton'
import { ModeToggle } from '../ModeToggle'
import { BorrowHealthCard } from './BorrowHealthCard'
import { AmountSection, SectionHeader } from './BorrowAmountSection'
import {
  BorrowActionModals,
  type BorrowHealthProps,
} from './BorrowActionModals'

const MODE_OPTIONS = [
  { value: 'borrow' as const, label: 'Borrow' },
  { value: 'repay' as const, label: 'Repay' },
]

export interface BorrowActionProps {
  selectedLendPosition: MarketPosition
}

export function BorrowAction({ selectedLendPosition }: BorrowActionProps) {
  const {
    markets,
    selectedMarket,
    borrowPositions,
    handleMarketSelect,
    handleTransaction,
    getQuote,
  } = useBorrowProviderContext()
  const { isExecuting, runTransaction, txModal, toast } = useBorrowTransaction()

  const [mode, setMode] = useState<'borrow' | 'repay'>('borrow')
  const [amount, setAmount] = useState('')
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)

  // Markets the user can pick from in borrow mode: those whose collateral
  // matches the chosen lend asset.
  const eligibleMarkets = useMemo(
    () =>
      markets.filter(
        (m) =>
          m.collateralAsset.metadata.symbol ===
          selectedLendPosition.asset.metadata.symbol,
      ),
    [markets, selectedLendPosition],
  )

  // Active market for the form: a market whose collateral matches the chosen
  // lend position (eligibleMarkets). Prefer the globally-selected market when
  // it is one of those, otherwise fall back to the first eligible market. This
  // keeps the form bound to the selected lend position rather than the global
  // default, so switching collateral always re-targets the matching market.
  const borrowMarket: BorrowMarket | null =
    eligibleMarkets.find(
      (m) =>
        selectedMarket && sameMarketId(m.marketId, selectedMarket.marketId),
    ) ??
    eligibleMarkets[0] ??
    null

  // The wallet's borrow position in the active market, if any.
  const activePosition =
    borrowMarket &&
    (borrowPositions.find((p) =>
      sameMarketId(p.marketId, borrowMarket.marketId),
    ) ??
      null)

  // In repay mode, the asset is locked to the asset currently borrowed.
  const repayAsset =
    mode === 'repay' && activePosition ? activePosition.borrowAsset : null

  // In repay mode, repay applies to the existing borrow's market.
  const activeMarket: BorrowMarket | null =
    mode === 'repay' && activePosition
      ? (markets.find((m) =>
          sameMarketId(m.marketId, activePosition.marketId),
        ) ?? null)
      : borrowMarket

  const activeAsset = repayAsset ?? activeMarket?.borrowAsset ?? null

  const bufferPct = activeMarket?.healthBufferPct ?? 0
  const maxLtv = activeMarket?.maxLtv ?? 0
  const safeCeilingLtv = computeSafeCeilingLtv(maxLtv, bufferPct)
  const borrowApy = activeMarket?.borrowApy ?? 0

  // For the projection: if a position exists, use its USD aggregates;
  // otherwise treat as a fresh open with the chosen lend position as
  // future collateral.
  const { collateralValueUsd: currentCollUsd, borrowValueUsd: currentBorrUsd } =
    positionUsd(activePosition)
  const lendCollateralUsd = lendPositionUsd(selectedLendPosition)
  const additionalLendCollateralUsd =
    directLendPositionUsd(selectedLendPosition)

  // For a fresh open (no existing position), collateral value is the
  // lend-position balance. After open, the user's dUSDC moves into the
  // borrow market; the lend balance shrinks accordingly. The demo treats
  // the full lend balance as the available collateral.
  const projectionCollateralUsd =
    currentCollUsd > 0
      ? currentCollUsd + additionalLendCollateralUsd
      : lendCollateralUsd

  const amountNum = parseFloat(amount) || 0
  const amountAssetPriceUsd = activeAsset
    ? stubPriceUsd(activeAsset.metadata.symbol)
    : 0
  const amountUsd = amountNum * amountAssetPriceUsd

  const { livePreview, isPreviewLoading } = useBorrowQuotePreview({
    activeMarket,
    amountNum,
    mode,
    currentCollUsd,
    selectedLendPosition,
    getQuote,
  })

  const { currentLtv, projectedLtv, wouldLiquidate, projectedHealthFactor } =
    useBorrowProjection({
      activeMarket,
      activeAsset,
      amountNum,
      amountUsd,
      mode,
      maxLtv,
      currentBorrUsd,
      currentCollUsd,
      projectionCollateralUsd,
      livePreview,
    })

  // Max button: in borrow mode, prefill to the safe ceiling;
  // in repay mode, prefill the current borrowed amount.
  const handleMax = () => {
    if (!activeAsset) return
    if (mode === 'repay') {
      if (!activePosition) return
      setAmount(activePosition.borrowAmountFormatted)
      return
    }
    const maxBorrowUsd = computeMaxBorrowSafeUsd(
      projectionCollateralUsd,
      safeCeilingLtv,
      currentBorrUsd,
    )
    if (amountAssetPriceUsd <= 0) return
    const maxBorrowInAsset = maxBorrowUsd / amountAssetPriceUsd
    setAmount(maxBorrowInAsset.toFixed(4))
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
  }

  const handleTokenClick = () => {
    if (mode !== 'borrow') return
    if (eligibleMarkets.length <= 1) return
    setAssetModalOpen(true)
  }

  const handleAssetSelect = (market: BorrowMarket) => {
    handleMarketSelect(market)
    setAssetModalOpen(false)
  }

  // Disable the CTA if the projected position enters the buffer zone
  // (past safe ceiling, before liquidation). Repay mode is exempt since it
  // only reduces LTV.
  const inBufferZone =
    mode === 'borrow' && projectedLtv > safeCeilingLtv && !wouldLiquidate
  // Gate the CTA on having a settled preview so the review modal never
  // shows a stale local projection while a /borrow/quote call is in flight.
  const canOpenReview =
    !!activeMarket &&
    !!activeAsset &&
    amountNum > 0 &&
    !wouldLiquidate &&
    !inBufferZone &&
    !isPreviewLoading

  const handleCtaClick = () => {
    if (!canOpenReview) return
    setReviewModalOpen(true)
  }

  const handleReviewConfirm = () => {
    if (!activeMarket || !activeAsset) return
    runTransaction({
      mode,
      activeMarket,
      activeAsset,
      amountNum,
      selectedLendPosition,
      currentCollUsd,
      handleTransaction,
      onReviewClose: () => setReviewModalOpen(false),
      onSuccess: () => setAmount(''),
    })
  }

  const ctaDisabled = !canOpenReview || isExecuting
  const ctaText = isExecuting
    ? 'Processing...'
    : mode === 'borrow'
      ? 'Borrow'
      : 'Repay'

  // Health readings shared by the inline card and the review modal.
  const health: BorrowHealthProps | null =
    activeMarket && activeAsset
      ? {
          currentLtv,
          projectedLtv,
          maxLtv,
          bufferPct,
          borrowApy,
          collateralAsset: activeMarket.collateralAsset,
          collateralValueUsd: projectionCollateralUsd,
          projectedHealthFactor,
          wouldLiquidate,
        }
      : null

  return (
    <div
      className="w-full"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E2EB',
        borderRadius: '24px',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.06)',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        marginTop: '16px',
      }}
    >
      <div
        className="py-6 px-6"
        style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
      >
        <SectionHeader />
        <ModeToggle mode={mode} onModeChange={setMode} options={MODE_OPTIONS} />

        <AmountSection
          mode={mode}
          amount={amount}
          onAmountChange={handleAmountChange}
          onMaxClick={handleMax}
          amountUsd={amountUsd}
          activeAsset={activeAsset}
          onTokenClick={
            mode === 'borrow' && eligibleMarkets.length > 1
              ? handleTokenClick
              : undefined
          }
        />

        {health && <BorrowHealthCard {...health} />}

        <CtaButton onClick={handleCtaClick} disabled={ctaDisabled}>
          {ctaText}
        </CtaButton>
      </div>

      <BorrowActionModals
        assetModalOpen={assetModalOpen}
        onAssetModalClose={() => setAssetModalOpen(false)}
        eligibleMarkets={eligibleMarkets}
        onAssetSelect={handleAssetSelect}
        reviewOpen={reviewModalOpen}
        onReviewClose={() => setReviewModalOpen(false)}
        onReviewConfirm={handleReviewConfirm}
        isExecuting={isExecuting}
        mode={mode}
        amount={amount}
        amountUsd={amountUsd}
        activeAsset={activeAsset}
        health={health}
        txModal={txModal}
        toast={toast}
      />
    </div>
  )
}
