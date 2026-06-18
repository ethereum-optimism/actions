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
import { lendPositionUsd, positionUsd } from '@/utils/borrowValuation'
import { assetBalanceAmount } from '@/utils/balanceMatching'
import { repayGateAsset, ReacquireDebtNotice } from '@/demoMagic'
import { DEBT_DUST_THRESHOLD } from '@/constants/borrow'
import { sameMarketId } from '@/utils/marketId'
import { displaySymbol } from '@/utils/tokenDisplay'
import { useTabSwitcher } from '@/contexts/TabSwitcherContext'
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

// Holding within 0.5% of the debt counts as repayable in full (interest dust).
const REPAY_FULL_TOLERANCE = 0.995

export function BorrowAction({ selectedLendPosition }: BorrowActionProps) {
  const {
    markets,
    selectedMarket,
    borrowPositions,
    tokenBalances,
    handleMarketSelect,
    handleTransaction,
    getQuote,
  } = useBorrowProviderContext()
  const { isExecuting, runTransaction, txModal, toast } = useBorrowTransaction()
  const { setActiveTab } = useTabSwitcher()

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

  // Prefer the globally-selected market if eligible, otherwise fall back to the first match.
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

  // Active market: user-selected in borrow mode, the position's market in repay mode.
  const activeMarket: BorrowMarket | null =
    mode === 'repay' && activePosition
      ? (markets.find((m) =>
          sameMarketId(m.marketId, activePosition.marketId),
        ) ?? null)
      : borrowMarket

  const activeAsset = repayAsset ?? activeMarket?.borrowAsset ?? null

  // Gate the repay on the asset the user holds (USDC_DEMO for the mirror market).
  const repayBalanceAsset = repayGateAsset(activeMarket, activeAsset)

  // Cap the repay at min(held balance, outstanding debt); the balance gates the CTA.
  const rawOutstandingDebt = activePosition
    ? parseFloat(activePosition.borrowAmountFormatted) || 0
    : 0
  const outstandingDebt =
    rawOutstandingDebt >= DEBT_DUST_THRESHOLD ? rawOutstandingDebt : 0
  // Scope to the market's chain: the repay spends USDC_DEMO on the borrow
  // chain, but the same asset can also hold a balance on the swap chain. Using
  // the cross-chain total would let Max prefill more than the wallet can spend
  // here and revert with "transfer amount exceeds balance".
  const debtBalance = assetBalanceAmount(
    tokenBalances,
    repayBalanceAsset,
    activeMarket?.marketId.chainId,
  )
  const maxRepayable = Math.min(debtBalance, outstandingDebt)
  const isRepay = mode === 'repay'
  const canRepayFull = debtBalance >= outstandingDebt * REPAY_FULL_TOLERANCE
  const cannotRepay = isRepay && outstandingDebt > 0 && debtBalance <= 0
  const partialRepayOnly =
    isRepay && outstandingDebt > 0 && debtBalance > 0 && !canRepayFull

  // Floor a number to the active asset's decimals (capped at 6) so a prefilled
  // or clamped repay never rounds above the held balance.
  const floorToAsset = (value: number) => {
    const decimals = Math.min(activeAsset?.metadata.decimals ?? 6, 6)
    const factor = 10 ** decimals
    return (Math.floor(value * factor) / factor).toString()
  }

  const bufferPct = activeMarket?.healthBufferPct ?? 0
  const maxLtv = activeMarket?.maxLtv ?? 0
  const safeCeilingLtv = computeSafeCeilingLtv(maxLtv, bufferPct)
  const borrowApy = activeMarket?.borrowApy ?? 0

  // Projection inputs: an existing position's USD aggregates, or a fresh open against the chosen lend position.
  const { collateralValueUsd: currentCollUsd, borrowValueUsd: currentBorrUsd } =
    positionUsd(activePosition)
  const lendCollateralUsd = lendPositionUsd(selectedLendPosition)

  // Use current collateral when a position exists; otherwise use the lend balance (fresh open).
  const projectionCollateralUsd =
    currentCollUsd > 0 ? currentCollUsd : lendCollateralUsd

  const amountNum = parseFloat(amount) || 0
  const amountAssetPriceUsd = activeAsset
    ? stubPriceUsd(activeAsset.metadata.symbol)
    : 0
  const amountUsd = amountNum * amountAssetPriceUsd

  // Gates the CTA on a settled quote; health display uses local stub prices (see useBorrowProjection).
  const { isPreviewLoading } = useBorrowQuotePreview({
    activeMarket,
    amountNum,
    mode,
    currentCollUsd,
    selectedLendPosition,
    getQuote,
  })

  // While the tx is executing, the optimistic position update lands (debt now
  // reflects the borrow) before the form amount clears. Zeroing the projected
  // delta during execution stops the health bar from briefly double-counting
  // the borrow and overshooting to 100%.
  const projectionAmountNum = isExecuting ? 0 : amountNum
  const projectionAmountUsd = isExecuting ? 0 : amountUsd

  const { currentLtv, projectedLtv, wouldLiquidate, projectedHealthFactor } =
    useBorrowProjection({
      activeMarket,
      activeAsset,
      amountNum: projectionAmountNum,
      amountUsd: projectionAmountUsd,
      mode,
      maxLtv,
      currentBorrUsd,
      currentCollUsd,
      projectionCollateralUsd,
    })

  // Max button: prefill the safe ceiling in borrow mode, the borrowed amount in repay mode.
  const handleMax = () => {
    if (!activeAsset) return
    if (mode === 'repay') {
      if (!activePosition) return
      // Full debt when the balance covers it (exact string avoids dust);
      // otherwise the floored held balance.
      setAmount(
        debtBalance >= outstandingDebt
          ? activePosition.borrowAmountFormatted
          : floorToAsset(maxRepayable),
      )
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
    if (v !== '' && !/^\d*\.?\d*$/.test(v)) return
    // In repay mode, cap entry at the max repayable (held balance vs debt)
    // rather than hard-blocking the keystroke.
    if (isRepay && v !== '' && maxRepayable > 0) {
      const parsed = parseFloat(v)
      if (Number.isFinite(parsed) && parsed > maxRepayable) {
        setAmount(floorToAsset(maxRepayable))
        return
      }
    }
    setAmount(v)
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
    !isPreviewLoading &&
    !cannotRepay &&
    !(isRepay && outstandingDebt <= 0)

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

        {repayBalanceAsset && (cannotRepay || partialRepayOnly) && (
          <ReacquireDebtNotice
            symbol={displaySymbol(repayBalanceAsset.metadata.symbol)}
            variant={cannotRepay ? 'none' : 'partial'}
            maxRepayable={maxRepayable}
            onAcquire={() => setActiveTab('swap')}
          />
        )}

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
