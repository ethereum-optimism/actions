import { ActionsError, type Asset } from '@eth-optimism/actions-sdk'
import { useContext, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import TransactionModal from './TransactionModal'
import { Toast } from './Toast'
import { useActivityHighlight } from '../../contexts/ActivityHighlightContext'
import { colors } from '../../constants/colors'
import { trackEvent } from '@/utils/analytics'
import { isEthSymbol } from '@/utils/assetUtils'
import { stubPriceUsd } from '@/api/borrowApi'
import { BorrowProviderContext } from '@/contexts/BorrowProviderContext'
import { useCollateralStatus } from '@/hooks/useCollateralStatus'
import { computeProjection } from '@/utils/borrowMath'
import { BorrowHealthCard } from './borrow/BorrowHealthCard'
import { ReviewBorrowHealthModal } from './borrow/ReviewBorrowHealthModal'
import { CtaButton } from './CtaButton'
import { ModeToggle } from './ModeToggle'
import { AmountLabel } from './AmountLabel'
import { AmountInput } from './AmountInput'
import { IlliquidMarketNotice } from './IlliquidMarketNotice'

function floorToFixed(value: number, decimals: number): string {
  const factor = 10 ** decimals
  return (Math.floor(value * factor) / factor).toFixed(decimals)
}

interface ActionProps {
  assetBalance: string
  isLoadingBalance: boolean
  isMintingAsset: boolean
  depositedAmount: string | null
  assetSymbol: string
  /** Full Asset object (when available). Required for the collateral-aware
   * withdraw flow that shows a Health card when this asset is securing a
   * borrow position. */
  asset?: Asset | null
  onMintAsset?: () => void
  onTransaction: (
    mode: 'lend' | 'withdraw',
    amount: number,
  ) => Promise<{
    transactionHash?: string
    blockExplorerUrl?: string
  }>
  marketId?: {
    address: string
    chainId: number
  }
  provider?: 'morpho' | 'aave'
}

// Max withdrawal for illiquid Aave testnet market
const AAVE_MAX_WITHDRAW = 0.0001

function isIlliquidAaveMarket(
  provider?: string,
  marketId?: { address: string; chainId: number },
): boolean {
  return (
    provider === 'aave' &&
    marketId?.chainId === 11155420 &&
    marketId?.address.toLowerCase() ===
      '0x4200000000000000000000000000000000000006'
  )
}

function getCtaText(
  isLoading: boolean,
  isMintingAsset: boolean,
  needsMint: boolean,
  mode: 'lend' | 'withdraw',
  displaySymbol: string,
): string {
  if (isLoading) return 'Processing...'
  if (isMintingAsset) return 'Minting...'
  if (needsMint) return `Get ${displaySymbol}`
  return mode === 'lend' ? `Lend ${displaySymbol}` : `Withdraw ${displaySymbol}`
}

export function Action({
  assetBalance,
  isLoadingBalance,
  isMintingAsset,
  depositedAmount,
  assetSymbol,
  asset,
  onMintAsset,
  onTransaction,
  marketId,
  provider,
}: ActionProps) {
  const { hoveredAction } = useActivityHighlight()
  const [isLoading, setIsLoading] = useState(false)
  const displaySymbol = assetSymbol.replace('_DEMO', '')
  const [mode, setMode] = useState<'lend' | 'withdraw'>('lend')
  const [amount, setAmount] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStatus, setModalStatus] = useState<'loading' | 'error'>('loading')
  const [modalMessage, setModalMessage] = useState<string | undefined>()
  const [reviewBorrowOpen, setReviewBorrowOpen] = useState(false)

  // Collateral-aware withdraw: if the lent asset is currently securing a
  // borrow position, we show a Health card showing projected health for
  // the typed withdraw, and route the submit through ReviewBorrowHealthModal.
  const collateralStatus = useCollateralStatus(asset ?? null)
  const pledgedPosition = collateralStatus.positions[0] ?? null
  // Same fallback pattern as useCollateralStatus: read via raw useContext
  // so Lend tests don't need to wrap in <BorrowProviderContextProvider>.
  const borrowCtx = useContext(BorrowProviderContext)
  const borrowMarkets = borrowCtx?.markets ?? []
  const pledgedMarket = pledgedPosition
    ? (borrowMarkets.find(
        (m) =>
          m.marketId.kind === pledgedPosition.marketId.kind &&
          m.marketId.chainId === pledgedPosition.marketId.chainId &&
          pledgedPosition.marketId.kind === 'morpho-blue' &&
          m.marketId.kind === 'morpho-blue' &&
          m.marketId.marketId === pledgedPosition.marketId.marketId,
      ) ?? null)
    : null
  const [toast, setToast] = useState<{
    visible: boolean
    title: string
    description: string
  }>({ visible: false, title: '', description: '' })

  const illiquidMarket = isIlliquidAaveMarket(provider, marketId)
  const isEthAsset = isEthSymbol(assetSymbol)
  const displayPrecision = isEthAsset ? 4 : 2
  const isLockedWithdrawAmount = illiquidMarket && mode === 'withdraw'
  const effectiveAmount = isLockedWithdrawAmount
    ? AAVE_MAX_WITHDRAW.toString()
    : amount

  const balanceValue = parseFloat(assetBalance || '0')
  const needsMint = balanceValue <= 0 && mode === 'lend'
  const amountValue = parseFloat(effectiveAmount) || 0
  // Per PR #4's ASK-B1: when the lent asset is securing a borrow, Max
  // must subtract the pledged collateral so users can't queue a withdraw
  // that would liquidate. SDK has not yet enforced this server-side; the
  // frontend is the only guard.
  const pledgedCollateralAmount = pledgedPosition
    ? parseFloat(pledgedPosition.collateralAmountFormatted || '0')
    : 0
  const rawMaxAmount = mode === 'lend' ? assetBalance : depositedAmount || '0'
  const maxAmount =
    mode === 'withdraw' && pledgedCollateralAmount > 0
      ? Math.max(
          0,
          parseFloat(rawMaxAmount) - pledgedCollateralAmount,
        ).toString()
      : rawMaxAmount
  const hasDeposit = parseFloat(depositedAmount || '0') > 0

  const isActionDisabled = needsMint
    ? false
    : isLoading ||
      !effectiveAmount ||
      amountValue <= 0 ||
      amountValue > parseFloat(maxAmount) ||
      (isLockedWithdrawAmount && !hasDeposit)

  const isHighlighted =
    (hoveredAction === 'deposit' && mode === 'lend') ||
    (hoveredAction === 'withdraw' && mode === 'withdraw')

  // Withdraw-with-collateral projection
  const showHealthCard = mode === 'withdraw' && !!pledgedPosition && !!asset
  const collateralProjection = useMemo(() => {
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
    const projection = computeProjection(
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
      projection,
      borrSymbol: pledgedPosition.borrowAsset.metadata.symbol,
    }
  }, [amount, asset, pledgedPosition, pledgedMarket, showHealthCard])

  const projectedLtv =
    collateralProjection && collateralProjection.projection.kind === 'projected'
      ? collateralProjection.projection.ltv
      : (collateralProjection?.currentLtv ?? 0)
  const projectedHealthFactor =
    collateralProjection && collateralProjection.projection.kind === 'projected'
      ? collateralProjection.projection.healthFactor
      : Number.POSITIVE_INFINITY
  const withdrawWouldLiquidate =
    collateralProjection?.projection.kind === 'wouldLiquidate'

  const handleMaxClick = () => {
    let value = parseFloat(maxAmount)
    if (illiquidMarket && mode === 'withdraw') {
      value = Math.min(parseFloat(depositedAmount || '0'), AAVE_MAX_WITHDRAW)
    }
    setAmount(floorToFixed(value, displayPrecision))
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value)
    }
  }

  const runTransaction = async () => {
    const eventData = {
      action: mode,
      asset: assetSymbol,
      amount: amountValue,
      provider,
    }
    trackEvent('transaction_initiated', eventData)

    setIsLoading(true)
    setModalOpen(true)
    setModalStatus('loading')

    try {
      await onTransaction(mode, amountValue)
      setModalOpen(false)
      setToast({
        visible: true,
        title: mode === 'lend' ? 'Lent' : 'Withdrawn',
        description: `${amountValue} ${displaySymbol}`,
      })
      setAmount('')
      trackEvent('transaction_success', eventData)
    } catch (e) {
      const displayMessage =
        e instanceof ActionsError ? e.shortMessage : undefined
      setModalMessage(displayMessage)
      setModalStatus('error')
      trackEvent('transaction_error', eventData)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCtaClick = async () => {
    if (needsMint) {
      trackEvent('mint_asset', { asset: assetSymbol })
      onMintAsset?.()
      return
    }
    if (isActionDisabled) return

    // If withdrawing against pledged collateral, route through the
    // review modal so the user sees the projected health impact.
    if (showHealthCard && pledgedPosition) {
      setReviewBorrowOpen(true)
      return
    }

    await runTransaction()
  }

  const handleReviewConfirm = async () => {
    setReviewBorrowOpen(false)
    await runTransaction()
  }

  const ctaText = getCtaText(
    isLoading,
    isMintingAsset,
    needsMint,
    mode,
    displaySymbol,
  )
  const ctaDisabled = isMintingAsset || (needsMint ? false : isActionDisabled)

  return (
    <div
      className="w-full"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E2EB',
        borderRadius: '24px',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.06)',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        className="py-6 px-6"
        style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}
      >
        <ModeToggle
          mode={mode}
          onModeChange={setMode}
          options={[
            { value: 'lend', label: 'Lend' },
            { value: 'withdraw', label: 'Withdraw' },
          ]}
        />

        <div
          className="transition-all"
          style={{
            backgroundColor: isHighlighted
              ? colors.highlight.background
              : 'transparent',
            borderRadius: '12px',
            padding: isHighlighted ? '16px' : '0',
            margin: isHighlighted ? '-16px' : '0',
            display: 'flex',
            flexDirection: 'column',
            gap: '32px',
          }}
        >
          <AmountLabel
            mode={mode}
            isLoadingBalance={isLoadingBalance}
            isLockedWithdrawAmount={isLockedWithdrawAmount}
            assetBalance={assetBalance}
            depositedAmount={depositedAmount}
            displaySymbol={displaySymbol}
            displayPrecision={displayPrecision}
            onMaxClick={handleMaxClick}
          />

          <AmountInput
            value={effectiveAmount}
            onChange={handleAmountChange}
            disabled={isLockedWithdrawAmount}
            displaySymbol={displaySymbol}
          />

          {showHealthCard && collateralProjection && pledgedPosition && (
            <BorrowHealthCard
              currentLtv={collateralProjection.currentLtv}
              projectedLtv={projectedLtv}
              maxLtv={collateralProjection.maxLtv}
              bufferPct={collateralProjection.bufferPct}
              borrowApy={collateralProjection.borrowApy}
              collateralAsset={pledgedPosition.collateralAsset}
              collateralValueUsd={collateralProjection.collValueUsd}
              projectedHealthFactor={projectedHealthFactor}
              wouldLiquidate={withdrawWouldLiquidate}
            />
          )}

          <CtaButton onClick={handleCtaClick} disabled={ctaDisabled}>
            {ctaText}
          </CtaButton>

          {isLockedWithdrawAmount && (
            <IlliquidMarketNotice maxWithdraw={AAVE_MAX_WITHDRAW} />
          )}
        </div>
      </div>

      {showHealthCard && collateralProjection && pledgedPosition && asset && (
        <ReviewBorrowHealthModal
          isOpen={reviewBorrowOpen}
          onClose={() => setReviewBorrowOpen(false)}
          onConfirm={handleReviewConfirm}
          isExecuting={isLoading}
          flow="withdraw"
          amount={{ main: amount || '0' }}
          amountUsd={
            (parseFloat(amount) || 0) > 0
              ? `$${((parseFloat(amount) || 0) * stubPriceUsd(asset.metadata.symbol)).toFixed(2)}`
              : null
          }
          asset={asset}
          assetLogo={''}
          currentLtv={collateralProjection.currentLtv}
          projectedLtv={projectedLtv}
          maxLtv={collateralProjection.maxLtv}
          bufferPct={collateralProjection.bufferPct}
          borrowApy={collateralProjection.borrowApy}
          collateralAsset={pledgedPosition.collateralAsset}
          collateralValueUsd={collateralProjection.collValueUsd}
          projectedHealthFactor={projectedHealthFactor}
          wouldLiquidate={withdrawWouldLiquidate}
        />
      )}

      <TransactionModal
        isOpen={modalOpen}
        status={modalStatus}
        errorMessage={modalMessage}
        onClose={() => {
          setModalOpen(false)
          setModalStatus('loading')
          setModalMessage(undefined)
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
