import { useState } from 'react'
import { createPortal } from 'react-dom'
import TransactionModal from './TransactionModal'
import { Toast } from './Toast'
import { useActivityHighlight } from '../../contexts/ActivityHighlightContext'
import { colors } from '../../constants/colors'
import { trackEvent } from '@/utils/analytics'
import { isEthSymbol } from '@/utils/assetUtils'
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

  const handleCtaClick = async () => {
    if (needsMint) {
      trackEvent('mint_asset', { asset: assetSymbol })
      onMintAsset?.()
      return
    }
    if (isActionDisabled) return

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
    } catch {
      setModalStatus('error')
      trackEvent('transaction_error', eventData)
    } finally {
      setIsLoading(false)
    }
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
        <ModeToggle mode={mode} onModeChange={setMode} />

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

          <CtaButton onClick={handleCtaClick} disabled={ctaDisabled}>
            {ctaText}
          </CtaButton>

          {isLockedWithdrawAmount && (
            <IlliquidMarketNotice maxWithdraw={AAVE_MAX_WITHDRAW} />
          )}
        </div>
      </div>

      <TransactionModal
        isOpen={modalOpen}
        status={modalStatus}
        onClose={() => {
          setModalOpen(false)
          setModalStatus('loading')
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
