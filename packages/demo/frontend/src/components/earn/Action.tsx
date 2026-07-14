import { ActionsError, type Asset } from '@eth-optimism/actions-sdk'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import TransactionModal from './TransactionModal'
import { Toast } from './Toast'
import { useActivityHighlight } from '../../contexts/ActivityHighlightContext'
import { colors } from '../../constants/colors'
import { trackEvent } from '@/utils/analytics'
import { isEthSymbol } from '@/utils/assetUtils'
import {
  displaySymbol as toDisplaySymbol,
  floorToFixed,
  formatUsd,
} from '@/utils/tokenDisplay'
import { stubPriceUsd } from '@/utils/stubPrices' // retired by #482
import { useWithdrawCollateral } from '@/hooks/useWithdrawCollateral'
import { BorrowHealthCard } from './borrow/BorrowHealthCard'
import { ReviewBorrowHealthModal } from './borrow/ReviewBorrowHealthModal'
import { CtaButton } from './CtaButton'
import { ModeToggle } from './ModeToggle'
import { AmountLabel } from './AmountLabel'
import { AmountInput } from './AmountInput'
import { IlliquidMarketNotice } from './IlliquidMarketNotice'
import Shimmer from './Shimmer'

interface ActionProps {
  assetBalance: string
  isLoadingBalance: boolean
  isMintingAsset: boolean
  depositedAmount: string | null
  directDepositedAmount?: string | null
  assetSymbol: string
  /** Full Asset object (when available). Required for the collateral-aware
   * withdraw flow that shows a Health card when this asset is securing a
   * borrow position. */
  asset?: Asset | null
  onMintAsset?: () => Promise<void> | void
  onTransaction: (
    mode: 'lend' | 'withdraw',
    amount: number,
    options?: {
      releaseCollateral?: {
        marketId: {
          kind: 'morpho-blue'
          marketId: string
          chainId: number
        }
        amountRaw: bigint
      }
    },
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
  directDepositedAmount,
  assetSymbol,
  asset,
  onMintAsset,
  onTransaction,
  marketId,
  provider,
}: ActionProps) {
  const { hoveredAction } = useActivityHighlight()
  const [isLoading, setIsLoading] = useState(false)
  const displaySymbol = toDisplaySymbol(assetSymbol)
  const [mode, setMode] = useState<'lend' | 'withdraw'>('lend')
  const [amount, setAmount] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStatus, setModalStatus] = useState<'loading' | 'error'>('loading')
  const [modalMessage, setModalMessage] = useState<string | undefined>()
  const [reviewBorrowOpen, setReviewBorrowOpen] = useState(false)
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
  const maxAmount = mode === 'lend' ? assetBalance : depositedAmount || '0'
  const hasDeposit = parseFloat(depositedAmount || '0') > 0

  const isHighlighted =
    (hoveredAction === 'deposit' && mode === 'lend') ||
    (hoveredAction === 'withdraw' && mode === 'withdraw')

  // Collateral-aware withdraw: surfaces the projected-health card, gates the CTA, and computes the collateral to release.
  const {
    pledgedPosition,
    showHealthCard,
    withdrawIntoBuffer,
    withdrawWouldLiquidate,
    releaseCollateralAmountRaw,
    health,
  } = useWithdrawCollateral({
    asset,
    mode,
    amount: effectiveAmount,
    amountValue,
    maxAmount,
    directDepositedAmount,
  })

  const isActionDisabled = needsMint
    ? false
    : isLoading ||
      !effectiveAmount ||
      amountValue <= 0 ||
      amountValue > parseFloat(maxAmount) ||
      (isLockedWithdrawAmount && !hasDeposit) ||
      withdrawIntoBuffer ||
      withdrawWouldLiquidate

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
      await onTransaction(mode, amountValue, {
        ...(mode === 'withdraw' && releaseCollateralAmountRaw && pledgedPosition
          ? {
              releaseCollateral: {
                marketId: pledgedPosition.marketId,
                amountRaw: releaseCollateralAmountRaw,
              },
            }
          : {}),
      })
      setModalOpen(false)
      setToast({
        visible: true,
        title: mode === 'lend' ? 'Lent' : 'Withdrawn',
        description: `${amountValue} ${displaySymbol}`,
      })
      setAmount('')
      trackEvent('transaction_success', eventData)
    } catch (e) {
      console.error(`[lend] ${mode} failed:`, e)
      const shortMessage =
        e instanceof ActionsError ? e.shortMessage : undefined
      const displayMessage =
        illiquidMarket && mode === 'withdraw'
          ? 'This market has limited liquidity on testnet. This is a testnet-specific issue, please try again later.'
          : shortMessage
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
      try {
        await onMintAsset?.()
        setToast({
          visible: true,
          title: 'Minted',
          description: displaySymbol,
        })
      } catch {
        // Mint errors are surfaced via the activity log; no toast on failure.
      }
      return
    }
    if (isActionDisabled) return

    // Withdrawing against pledged collateral routes through the review modal to show the projected health first.
    if (showHealthCard) {
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

          {showHealthCard && health && <BorrowHealthCard {...health} />}

          {isLoadingBalance && !isMintingAsset ? (
            <div data-testid="shimmer">
              <Shimmer width="100%" height="48px" variant="rectangle" />
            </div>
          ) : (
            <CtaButton onClick={handleCtaClick} disabled={ctaDisabled}>
              {ctaText}
            </CtaButton>
          )}

          {isLockedWithdrawAmount && (
            <IlliquidMarketNotice maxWithdraw={AAVE_MAX_WITHDRAW} />
          )}
        </div>
      </div>

      {showHealthCard && health && asset && (
        <ReviewBorrowHealthModal
          isOpen={reviewBorrowOpen}
          onClose={() => setReviewBorrowOpen(false)}
          onConfirm={handleReviewConfirm}
          isExecuting={isLoading}
          flow="withdraw"
          amount={{ main: effectiveAmount || '0' }}
          amountUsd={formatUsd(
            parseFloat(effectiveAmount) || 0,
            stubPriceUsd(asset.metadata.symbol),
          )}
          asset={asset}
          {...health}
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
