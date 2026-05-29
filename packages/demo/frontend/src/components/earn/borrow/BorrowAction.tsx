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

import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BorrowMarket } from '@eth-optimism/actions-sdk'
import { stubPriceUsd } from '@/utils/stubPrices' // retired by #482
import { getBlockExplorerUrl } from '@/utils/blockExplorer'
import { useBorrowProviderContext } from '@/contexts/BorrowProviderContext'
import { useActivityLogger } from '@/hooks/useActivityLogger'
import { useBorrowQuotePreview } from '@/hooks/useBorrowQuotePreview'
import { useBorrowProjection } from '@/hooks/useBorrowProjection'
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
import TransactionModal from '../TransactionModal'
import { Toast } from '../Toast'
import { BorrowAssetModal } from './BorrowAssetModal'
import { BorrowHealthCard } from './BorrowHealthCard'
import { ReviewBorrowHealthModal } from './ReviewBorrowHealthModal'
import { AmountSection, SectionHeader } from './BorrowAmountSection'

const MODE_OPTIONS = [
  { value: 'borrow' as const, label: 'Borrow' },
  { value: 'repay' as const, label: 'Repay' },
]

export interface BorrowActionProps {
  selectedLendPosition: MarketPosition
}

function marketProviderDisplayName(kind: string): string {
  if (kind === 'morpho-blue') return 'Morpho'
  // Fallback: capitalize the provider prefix (e.g. `aave-v3` -> `Aave`).
  const head = kind.split('-')[0] ?? kind
  return head.charAt(0).toUpperCase() + head.slice(1)
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
  const { logActivity } = useActivityLogger()

  const [mode, setMode] = useState<'borrow' | 'repay'>('borrow')
  const [amount, setAmount] = useState('')
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [txModalOpen, setTxModalOpen] = useState(false)
  const [txStatus, setTxStatus] = useState<'loading' | 'error'>('loading')
  const [txError, setTxError] = useState<string | undefined>()
  const [isExecuting, setIsExecuting] = useState(false)
  const [toast, setToast] = useState<{
    visible: boolean
    title: string
    description: string
  }>({ visible: false, title: '', description: '' })

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

  // In repay mode, the asset is locked to the asset currently borrowed.
  const repayAsset =
    mode === 'repay' && selectedMarketPosition
      ? selectedMarketPosition.borrowAsset
      : null

  // Active market for the form: in borrow mode, the user-selected;
  // in repay mode, the position's market (since repay applies to an
  // existing borrow).
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

  // For the projection: if a position exists, use its USD aggregates;
  // otherwise treat as a fresh open with the chosen lend position as
  // future collateral.
  const { collateralValueUsd: currentCollUsd, borrowValueUsd: currentBorrUsd } =
    positionUsd(selectedMarketPosition)
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

  // useRef-based reentry guard so a rapid double-tap of the Confirm button
  // can't dispatch the same transaction twice before isExecuting commits.
  const executingRef = useRef(false)

  const handleCtaClick = () => {
    if (!canOpenReview) return
    setReviewModalOpen(true)
  }

  const handleReviewConfirm = async () => {
    if (executingRef.current) return
    if (!activeMarket || !activeAsset) return
    executingRef.current = true
    const symbol = activeAsset.metadata.symbol.replace('_DEMO', '')
    const activity = logActivity(mode, {
      amount: amountNum.toString(),
      assetSymbol: symbol,
      // Provider display name (e.g. "Morpho"), derived from the market's
      // discriminator, so the activity summary reads "Borrowed X OP from
      // Morpho" instead of "Wallet: borrow".
      marketName: marketProviderDisplayName(activeMarket.marketId.kind),
    })
    setIsExecuting(true)
    setReviewModalOpen(false)
    setTxModalOpen(true)
    setTxStatus('loading')
    setTxError(undefined)
    try {
      let receipt
      if (mode === 'borrow') {
        const collateralSharesRaw = selectedLendPosition.depositedSharesRaw
        const topUpCollateralSharesRaw =
          currentCollUsd > 0
            ? selectedLendPosition.directDepositedSharesRaw
            : collateralSharesRaw
        if (
          currentCollUsd === 0 &&
          (collateralSharesRaw === null || collateralSharesRaw <= 0n)
        ) {
          throw new Error(
            'No collateral shares available for this lend position',
          )
        }
        receipt = await handleTransaction('open', {
          marketId: activeMarket.marketId,
          borrowAmount: { amount: amountNum },
          ...(topUpCollateralSharesRaw !== null && topUpCollateralSharesRaw > 0n
            ? { collateralAmount: { amountRaw: topUpCollateralSharesRaw } }
            : {}),
          collateralAsset: undefined,
        })
      } else {
        receipt = await handleTransaction('repay', {
          marketId: activeMarket.marketId,
          amount: { amount: amountNum },
        })
      }
      const blockExplorerUrl = getBlockExplorerUrl(
        activeMarket.marketId.chainId,
        receipt,
      )
      activity?.confirm({ blockExplorerUrl })
      setTxModalOpen(false)
      setAmount('')
      setToast({
        visible: true,
        title: mode === 'borrow' ? 'Borrowed' : 'Repaid',
        description: `${amountNum} ${symbol}`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Transaction failed'
      activity?.error()
      setTxStatus('error')
      setTxError(msg)
    } finally {
      setIsExecuting(false)
      executingRef.current = false
    }
  }

  const ctaDisabled = !canOpenReview || isExecuting
  const ctaText = isExecuting
    ? 'Processing...'
    : mode === 'borrow'
      ? 'Borrow'
      : 'Repay'

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

        {activeMarket && activeAsset && (
          <BorrowHealthCard
            currentLtv={currentLtv}
            projectedLtv={projectedLtv}
            maxLtv={maxLtv}
            bufferPct={bufferPct}
            borrowApy={borrowApy}
            collateralAsset={activeMarket.collateralAsset}
            collateralValueUsd={projectionCollateralUsd}
            projectedHealthFactor={projectedHealthFactor}
            wouldLiquidate={wouldLiquidate}
          />
        )}

        <CtaButton onClick={handleCtaClick} disabled={ctaDisabled}>
          {ctaText}
        </CtaButton>
      </div>

      <BorrowAssetModal
        isOpen={assetModalOpen}
        onClose={() => setAssetModalOpen(false)}
        markets={eligibleMarkets}
        onSelect={handleAssetSelect}
      />

      {activeMarket && activeAsset && (
        <ReviewBorrowHealthModal
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          onConfirm={handleReviewConfirm}
          isExecuting={isExecuting}
          flow={mode === 'borrow' ? 'borrow' : 'repay'}
          amount={{ main: amount || '0' }}
          amountUsd={amountUsd > 0 ? `$${amountUsd.toFixed(2)}` : null}
          asset={activeAsset}
          currentLtv={currentLtv}
          projectedLtv={projectedLtv}
          maxLtv={maxLtv}
          bufferPct={bufferPct}
          borrowApy={borrowApy}
          collateralAsset={activeMarket.collateralAsset}
          collateralValueUsd={projectionCollateralUsd}
          projectedHealthFactor={projectedHealthFactor}
          wouldLiquidate={wouldLiquidate}
        />
      )}

      <TransactionModal
        isOpen={txModalOpen}
        status={txStatus}
        errorMessage={txError}
        onClose={() => {
          setTxModalOpen(false)
          setTxStatus('loading')
          setTxError(undefined)
        }}
      />

      {createPortal(
        <Toast
          isVisible={toast.visible}
          onClose={() => setToast((t) => ({ ...t, visible: false }))}
          title={toast.title}
          description={toast.description}
        />,
        document.body,
      )}
    </div>
  )
}
