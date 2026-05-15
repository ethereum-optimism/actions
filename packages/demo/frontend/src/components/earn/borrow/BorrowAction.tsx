/**
 * Borrow tab form.
 *
 * Composes ModeToggle (Borrow / Repay) + AmountInput (with optional
 * token-chip selector) + BorrowHealthCard (with live projection) +
 * CtaButton + Asset modal + Review modal + TransactionModal + Toast.
 *
 * The projection (LTV, HF, would-liquidate) is sourced from
 * `borrowApi.getPrice` with a 250 ms debounce on amount/mode/market
 * changes. Local stub-price math is kept only for the synchronous Max
 * button prefill and for current-position USD display.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  BorrowMarket,
  BorrowMarketPosition,
  BorrowPrice,
} from '@eth-optimism/actions-sdk'
import { stubPriceUsd } from '@/api/borrowApi'
import { getBlockExplorerUrl } from '@/utils/blockExplorer'
import { useBorrowProviderContext } from '@/contexts/BorrowProviderContext'
import { useActivityLogger } from '@/hooks/useActivityLogger'
import {
  computeMaxBorrowSafeUsd,
  computeProjection,
  computeSafeCeilingLtv,
} from '@/utils/borrowMath'
import type { MarketPosition } from '@/types/market'
import { AmountInput } from '../AmountInput'
import { CtaButton, MaxButton } from '../CtaButton'
import { ModeToggle } from '../ModeToggle'
import TransactionModal from '../TransactionModal'
import { Toast } from '../Toast'
import { BorrowAssetModal } from './BorrowAssetModal'
import { BorrowHealthCard } from './BorrowHealthCard'
import { ReviewBorrowHealthModal } from './ReviewBorrowHealthModal'

const MODE_OPTIONS = [
  { value: 'borrow' as const, label: 'Borrow' },
  { value: 'repay' as const, label: 'Repay' },
]

export interface BorrowActionProps {
  selectedLendPosition: MarketPosition
}

interface PositionUsd {
  collateralValueUsd: number
  borrowValueUsd: number
}

function positionUsd(position: BorrowMarketPosition | null): PositionUsd {
  if (!position) return { collateralValueUsd: 0, borrowValueUsd: 0 }
  const collPrice = stubPriceUsd(position.collateralAsset.metadata.symbol)
  const borrPrice = stubPriceUsd(position.borrowAsset.metadata.symbol)
  return {
    collateralValueUsd:
      parseFloat(position.collateralAmountFormatted || '0') * collPrice,
    borrowValueUsd:
      parseFloat(position.borrowAmountFormatted || '0') * borrPrice,
  }
}

function lendPositionUsd(position: MarketPosition): number {
  const price = stubPriceUsd(position.asset.metadata.symbol)
  return parseFloat(position.depositedAmount || '0') * price
}

function directLendPositionUsd(position: MarketPosition): number {
  const price = stubPriceUsd(position.asset.metadata.symbol)
  return parseFloat(position.directDepositedAmount || '0') * price
}

export function BorrowAction({ selectedLendPosition }: BorrowActionProps) {
  const {
    markets,
    selectedMarket,
    selectedMarketPosition,
    handleMarketSelect,
    handleTransaction,
    getPrice,
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
      ? (markets.find(
          (m) =>
            m.marketId.kind === selectedMarketPosition.marketId.kind &&
            m.marketId.chainId === selectedMarketPosition.marketId.chainId &&
            selectedMarketPosition.marketId.kind === 'morpho-blue' &&
            m.marketId.kind === 'morpho-blue' &&
            m.marketId.marketId === selectedMarketPosition.marketId.marketId,
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

  // Local fallback projection: used while the debounced backend
  // preview is in flight, and for instant feedback as the user types.
  const localProjection = useMemo(() => {
    if (!activeMarket || !activeAsset || amountNum <= 0) return null
    return computeProjection(
      {
        borrowValueUsd: currentBorrUsd,
        collateralValueUsd: projectionCollateralUsd,
      },
      {
        kind: mode === 'borrow' ? 'borrow' : 'repay',
        deltaValueUsd: amountUsd,
      },
      maxLtv,
    )
  }, [
    activeMarket,
    activeAsset,
    amountNum,
    amountUsd,
    currentBorrUsd,
    projectionCollateralUsd,
    mode,
    maxLtv,
  ])

  // Backend-driven preview from `/borrow/price`. Debounced and
  // race-safe — outdated responses are discarded on cancel.
  const [livePreview, setLivePreview] = useState<BorrowPrice | null>(null)
  useEffect(() => {
    if (!activeMarket || amountNum <= 0) {
      setLivePreview(null)
      return
    }
    let cancelled = false
    const handle = setTimeout(async () => {
      try {
        const lendCollateralSharesRaw = selectedLendPosition.depositedSharesRaw
        const directCollateralSharesRaw =
          selectedLendPosition.directDepositedSharesRaw
        const params =
          mode === 'borrow'
            ? ({
                action: 'open' as const,
                marketId: activeMarket.marketId,
                borrowAmount: { amount: amountNum },
                // Fresh-open: pledge the user's full vault-share balance.
                // Existing position: pledge only newly added direct lend shares.
                ...((currentCollUsd === 0 &&
                  lendCollateralSharesRaw !== null &&
                  lendCollateralSharesRaw > 0n) ||
                (currentCollUsd > 0 &&
                  directCollateralSharesRaw !== null &&
                  directCollateralSharesRaw > 0n)
                  ? {
                      collateralAmount: {
                        amountRaw:
                          currentCollUsd === 0
                            ? lendCollateralSharesRaw!
                            : directCollateralSharesRaw!,
                      },
                    }
                  : {}),
              } as const)
            : ({
                action: 'repay' as const,
                marketId: activeMarket.marketId,
                amount: { amount: amountNum },
              } as const)
        const price = await getPrice(params)
        if (!cancelled) setLivePreview(price)
      } catch {
        // Network / 4xx — fall back to the local projection.
        if (!cancelled) setLivePreview(null)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [
    activeMarket,
    amountNum,
    currentCollUsd,
    mode,
    selectedLendPosition,
    getPrice,
  ])

  const backendLtv = livePreview?.positionAfter.ltv ?? null
  const backendHf = livePreview?.positionAfter.healthFactor ?? null

  const currentLtv =
    projectionCollateralUsd > 0 ? currentBorrUsd / projectionCollateralUsd : 0
  const projectedLtv =
    backendLtv !== null
      ? backendLtv
      : localProjection && localProjection.kind === 'projected'
        ? localProjection.ltv
        : currentLtv
  // Backend doesn't surface a discrete "would liquidate" flag — treat a
  // projected LTV at or above maxLtv as the sentinel.
  const wouldLiquidate =
    backendLtv !== null
      ? backendLtv >= maxLtv
      : localProjection?.kind === 'wouldLiquidate'
  const projectedHealthFactor =
    backendHf !== null
      ? backendHf
      : localProjection && localProjection.kind === 'projected'
        ? localProjection.healthFactor
        : Number.POSITIVE_INFINITY

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
  // (past safe ceiling, before liquidation). Users can lower the amount
  // or use Max (which prefills to the safe ceiling) to re-enable. Repay
  // mode is exempt since it only reduces LTV.
  const inBufferZone =
    mode === 'borrow' && projectedLtv > safeCeilingLtv && !wouldLiquidate
  const canOpenReview =
    !!activeMarket &&
    !!activeAsset &&
    amountNum > 0 &&
    !wouldLiquidate &&
    !inBufferZone

  const handleCtaClick = () => {
    if (!canOpenReview) return
    setReviewModalOpen(true)
  }

  const handleReviewConfirm = async () => {
    if (!activeMarket || !activeAsset) return
    const symbol = activeAsset.metadata.symbol.replace('_DEMO', '')
    const activity = logActivity(mode, {
      amount: amountNum.toString(),
      assetSymbol: symbol,
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
            ? {
                collateralAmount: {
                  amountRaw: topUpCollateralSharesRaw,
                },
              }
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
          assetLogo={''}
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

function SectionHeader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '16px',
        fontWeight: 600,
        color: '#1a1b1e',
      }}
    >
      Select Asset
      <InlineInfoIcon />
    </div>
  )
}

function AmountSection({
  mode,
  amount,
  onAmountChange,
  onMaxClick,
  amountUsd,
  activeAsset,
  onTokenClick,
}: {
  mode: 'borrow' | 'repay'
  amount: string
  onAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onMaxClick: () => void
  amountUsd: number
  activeAsset: { metadata: { symbol: string } } | null
  onTokenClick?: () => void
}) {
  const symbol =
    activeAsset?.metadata.symbol.replace('_DEMO', '') ?? 'Select token'
  const inputProps = onTokenClick
    ? {
        value: amount,
        onChange: onAmountChange,
        disabled: false,
        displaySymbol: symbol,
        onTokenClick,
      }
    : {
        value: amount,
        onChange: onAmountChange,
        disabled: false,
        displaySymbol: symbol,
      }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ color: '#1a1b1e', fontSize: '14px' }}>
        {mode === 'borrow' ? 'Borrow' : 'Repay'}
      </span>
      <AmountInput {...inputProps} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '13px',
          color: '#9195A6',
        }}
      >
        <span>${amountUsd.toFixed(2)}</span>
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <MaxButton onClick={onMaxClick} />
        </span>
      </div>
    </div>
  )
}

function InlineInfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.5" stroke="#9195A6" strokeWidth="1.2" />
      <path
        d="M7 4V7M7 9.25V9.5"
        stroke="#9195A6"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
