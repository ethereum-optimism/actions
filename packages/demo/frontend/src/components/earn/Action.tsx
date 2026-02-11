import { useState } from 'react'
import TransactionModal from './TransactionModal'
import Shimmer from './Shimmer'
import { useActivityHighlight } from '../../contexts/ActivityHighlightContext'
import { colors } from '../../constants/colors'
import { trackEvent } from '@/utils/analytics'
import { isEthSymbol } from '@/utils/assetUtils'
import { CtaButton } from './CtaButton'

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
  const [modalStatus, setModalStatus] = useState<
    'loading' | 'success' | 'error'
  >('loading')
  const [blockExplorerUrl, setBlockExplorerUrl] = useState<string | undefined>(
    undefined,
  )

  // Check if this is the illiquid Aave OP Sepolia ETH market
  const isIlliquidAaveMarket =
    provider === 'aave' &&
    marketId?.chainId === 11155420 &&
    marketId?.address.toLowerCase() ===
      '0x4200000000000000000000000000000000000006'

  // Max withdrawal for illiquid Aave market
  const AAVE_MAX_WITHDRAW = 0.0001

  // Determine display precision based on asset type
  const isEthAsset = isEthSymbol(assetSymbol)
  const displayPrecision = isEthAsset ? 4 : 2

  // For illiquid Aave market, lock withdraw amount to fixed value
  const isLockedWithdrawAmount = isIlliquidAaveMarket && mode === 'withdraw'
  const lockedAmount = AAVE_MAX_WITHDRAW.toString()
  const effectiveAmount = isLockedWithdrawAmount ? lockedAmount : amount

  // Balance state
  const balanceValue = parseFloat(assetBalance || '0')
  const hasBalance = balanceValue > 0
  const needsMint = !hasBalance && mode === 'lend'

  // Derived values for form validation
  const amountValue = parseFloat(effectiveAmount) || 0
  const maxAmount = mode === 'lend' ? assetBalance : depositedAmount || '0'
  const hasDeposit = parseFloat(depositedAmount || '0') > 0
  const isActionDisabled = needsMint
    ? false // "Get USDC" is always clickable
    : isLoading ||
      !effectiveAmount ||
      amountValue <= 0 ||
      amountValue > parseFloat(maxAmount) ||
      (isLockedWithdrawAmount && !hasDeposit)

  const handleMaxClick = () => {
    let value = parseFloat(maxAmount)

    if (isIlliquidAaveMarket && mode === 'withdraw') {
      const deposited = parseFloat(depositedAmount || '0')
      value = Math.min(deposited, AAVE_MAX_WITHDRAW)
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
    // Dynamic CTA: mint when no balance, lend/withdraw otherwise
    if (needsMint) {
      trackEvent('mint_asset', { asset: assetSymbol })
      onMintAsset?.()
      return
    }

    if (isActionDisabled) return

    trackEvent('transaction_initiated', {
      action: mode,
      asset: assetSymbol,
      amount: amountValue,
      provider,
    })

    setIsLoading(true)
    setModalOpen(true)
    setModalStatus('loading')
    setBlockExplorerUrl(undefined)

    try {
      const result = await onTransaction(mode, amountValue)

      setBlockExplorerUrl(result.blockExplorerUrl)
      setModalStatus('success')
      setAmount('')

      trackEvent('transaction_success', {
        action: mode,
        asset: assetSymbol,
        amount: amountValue,
        provider,
      })
    } catch {
      setModalStatus('error')
      trackEvent('transaction_error', {
        action: mode,
        asset: assetSymbol,
        amount: amountValue,
        provider,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setModalStatus('loading')
    setBlockExplorerUrl(undefined)
  }

  // CTA button text
  const ctaText = isLoading
    ? 'Processing...'
    : isMintingAsset
      ? 'Minting...'
      : needsMint
        ? `Get ${displaySymbol}`
        : mode === 'lend'
          ? `Lend ${displaySymbol}`
          : `Withdraw ${displaySymbol}`

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
        {/* Lend / Withdraw Toggle */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: '100%',
            backgroundColor: '#F5F5F7',
            borderRadius: '10px',
            padding: '3px',
          }}
        >
          {/* Sliding indicator */}
          <div
            style={{
              position: 'absolute',
              top: '3px',
              bottom: '3px',
              left: mode === 'lend' ? '3px' : '50%',
              width: 'calc(50% - 3px)',
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              transition: 'left 200ms ease-in-out',
            }}
          />
          <button
            onClick={() => setMode('lend')}
            style={{
              flex: 1,
              position: 'relative',
              padding: '10px 32px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 500,
              fontFamily: 'Inter',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              color: mode === 'lend' ? '#000' : '#666',
              transition: 'color 200ms ease-in-out',
            }}
          >
            Lend
          </button>
          <button
            onClick={() => setMode('withdraw')}
            style={{
              flex: 1,
              position: 'relative',
              padding: '10px 32px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 500,
              fontFamily: 'Inter',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              color: mode === 'withdraw' ? '#000' : '#666',
              transition: 'color 200ms ease-in-out',
            }}
          >
            Withdraw
          </button>
        </div>

        {/* Amount Section */}
        <div
          className="transition-all"
          style={{
            backgroundColor:
              (hoveredAction === 'deposit' && mode === 'lend') ||
              (hoveredAction === 'withdraw' && mode === 'withdraw')
                ? colors.highlight.background
                : 'transparent',
            borderRadius: '12px',
            padding:
              (hoveredAction === 'deposit' && mode === 'lend') ||
              (hoveredAction === 'withdraw' && mode === 'withdraw')
                ? '16px'
                : '0',
            margin:
              (hoveredAction === 'deposit' && mode === 'lend') ||
              (hoveredAction === 'withdraw' && mode === 'withdraw')
                ? '-16px'
                : '0',
            display: 'flex',
            flexDirection: 'column',
            gap: '32px',
          }}
        >
          {/* Label + Balance */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <label
              style={{
                color: '#0F111A',
                fontSize: '16px',
                fontWeight: 600,
                display: 'block',
              }}
            >
              {mode === 'lend' ? 'Amount to lend' : 'Amount to withdraw'}
            </label>
            {!isLockedWithdrawAmount && (
              <div className="flex items-center gap-1">
                {isLoadingBalance ? (
                  <Shimmer width="80px" height="16px" variant="rectangle" />
                ) : (
                  <>
                    <span style={{ color: '#9195A6', fontSize: '14px' }}>
                      {mode === 'lend'
                        ? `${floorToFixed(parseFloat(assetBalance), displayPrecision)} ${displaySymbol}`
                        : `${floorToFixed(parseFloat(depositedAmount || '0'), displayPrecision)} ${displaySymbol}`}
                    </span>
                    <button
                      onClick={handleMaxClick}
                      style={{
                        padding: '0 4px',
                        border: 'none',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#3374DB',
                        cursor: 'pointer',
                        backgroundColor: 'transparent',
                      }}
                    >
                      Max
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              border: '1px solid #E0E2EB',
              borderRadius: '12px',
              padding: '12px 16px',
              backgroundColor: '#FFFFFF',
            }}
          >
            <input
              type="text"
              placeholder="0"
              value={effectiveAmount}
              onChange={handleAmountChange}
              disabled={isLockedWithdrawAmount}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: '16px',
                color: isLockedWithdrawAmount ? '#9195A6' : '#000',
                backgroundColor: 'transparent',
                fontFamily: 'Inter',
                cursor: isLockedWithdrawAmount ? 'not-allowed' : 'text',
              }}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                paddingLeft: '12px',
                borderLeft: '1px solid #E0E2EB',
              }}
            >
              <span
                style={{
                  color: '#9195A6',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: 'Inter',
                }}
              >
                {displaySymbol}
              </span>
            </div>
          </div>

          {/* CTA Button */}
          <CtaButton onClick={handleCtaClick} disabled={ctaDisabled}>
            {ctaText}
          </CtaButton>

          {isLockedWithdrawAmount && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#1E40AF',
                fontWeight: 500,
              }}
            >
              <span style={{ fontSize: '16px' }}>ℹ️</span>
              <span>
                For the purposes of this demo, this testnet market only allows{' '}
                {AAVE_MAX_WITHDRAW} withdrawals.
              </span>
            </div>
          )}
        </div>
      </div>

      <TransactionModal
        isOpen={modalOpen}
        status={modalStatus}
        onClose={handleModalClose}
        blockExplorerUrl={blockExplorerUrl}
        mode={mode}
        assetSymbol={assetSymbol}
      />
    </div>
  )
}
