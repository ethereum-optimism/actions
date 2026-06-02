/**
 * Borrow tab form. Composes the mode toggle, amount section, health card, CTA,
 * and modals. The projection comes from `borrowApi.getQuote` via
 * `useBorrowQuotePreview`, with a local stub-price fallback in
 * `useBorrowProjection` (also used for the synchronous Max prefill).
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
    selectedMarketPosition,
    handleMarketSelect,
    handleTransaction,
    getQuote,
  } = useBorrowProviderContext()
  const { isExecuting, runTransaction, txModal, toast } = useBorrowTransaction()

  const [mode, setMode] = useState<'borrow' | 'repay'>('borrow')
  const [amount, setAmount] = useState('')
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)

  // Borrow-mode markets: those whose collateral matches the chosen lend asset.
  const eligibleMarkets = useMemo(
    () =>
      markets.filter(
        (m) =>
          m.collateralAsset.metadata.symbol ===
          selectedLendPosition.asset.metadata.symbol,
      ),
    [markets, selectedLendPosition],
  )

  // In repay mode, the asset is locked to the asset currently borrowed.
  const repayAsset =
    mode === 'repay' && selectedMarketPosition
      ? selectedMarketPosition.borrowAsset
      : null

  // Active market: user-selected in borrow mode, the position's market in repay mode.
  const activeMarket: BorrowMarket | null =
    mode === 'repay' && selectedMarketPosition
      ? (markets.find((m) =>
          sameMarketId(m.marketId, selectedMarketPosition.marketId),
        ) ?? null)
      : selectedMarket

  const activeAsset = repayAsset ?? activeMarket?.borrowAsset ?? null

  const bufferPct = activeMarket?.healthBufferPct ?? 0
  const maxLtv = activeMarket?.maxLtv ?? 0
  const safeCeilingLtv = computeSafeCeilingLtv(maxLtv, bufferPct)
  const borrowApy = activeMarket?.borrowApy ?? 0

  // Projection inputs: an existing position's USD aggregates, or a fresh open against the chosen lend position.
  const { collateralValueUsd: currentCollUsd, borrowValueUsd: currentBorrUsd } =
    positionUsd(selectedMarketPosition)
  const lendCollateralUsd = lendPositionUsd(selectedLendPosition)
  const additionalLendCollateralUsd =
    directLendPositionUsd(selectedLendPosition)

  // For a fresh open, the demo treats the full lend balance as available collateral.
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

  // Max button: prefill the safe ceiling in borrow mode, the borrowed amount in repay mode.
  const handleMax = () => {
    if (!activeAsset) return
    if (mode === 'repay') {
      if (!selectedMarketPosition) return
      setAmount(selectedMarketPosition.borrowAmountFormatted)
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

  // Disable the CTA when the projection enters the buffer zone; repay is exempt since it only reduces LTV.
  const inBufferZone =
    mode === 'borrow' && projectedLtv > safeCeilingLtv && !wouldLiquidate
  // Gate the CTA on a settled preview so the review modal never shows a stale projection.
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
