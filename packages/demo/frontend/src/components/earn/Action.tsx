import { useState } from 'react'
import TransactionModal from './TransactionModal'
import Shimmer from './Shimmer'
import { useActivityHighlight } from '../../contexts/ActivityHighlightContext'
import { colors } from '../../constants/colors'
import { trackEvent } from '@/utils/analytics'

interface ActionProps {
  assetBalance: string
  isLoadingBalance: boolean
  depositedAmount: string | null
  assetSymbol: string
  assetLogo: string
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

/**
 * Presentational component for the Action card
 * Handles UI state and user interactions, delegates business logic to container
 */
export function Action({
  assetBalance,
  isLoadingBalance,
  depositedAmount,
  assetSymbol,
  assetLogo,
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
  const isWethAsset = assetSymbol === 'WETH'
  const displayPrecision = isWethAsset ? 4 : 2

  const handleMaxClick = () => {
    let maxAmount = mode === 'lend' ? assetBalance : depositedAmount || '0'

    // For illiquid Aave market in withdraw mode, cap at max withdrawal limit
    if (isIlliquidAaveMarket && mode === 'withdraw') {
      const deposited = parseFloat(depositedAmount || '0')
      maxAmount = Math.min(deposited, AAVE_MAX_WITHDRAW).toString()
    }

    const rounded = parseFloat(maxAmount).toFixed(displayPrecision)
    setAmount(rounded)
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Allow only numbers and decimals
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value)
    }
  }

  const handleLendUSDC = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      return
    }

    const amountValue = parseFloat(amount)
    const maxAmount =
      mode === 'lend'
        ? parseFloat(assetBalance)
        : parseFloat(depositedAmount || '0')
    if (amountValue > maxAmount) {
      return
    }

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

  return (
    <div
      className="w-full"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E2EB',
        borderRadius: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        className="py-6 px-6 transition-all"
        style={{
          backgroundColor:
            hoveredAction === 'getBalance'
              ? colors.highlight.background
              : 'transparent',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
        }}
      >
        <div className="flex items-center justify-between">
          <h2
            className="font-semibold"
            style={{ color: '#1a1b1e', fontSize: '16px' }}
          >
            Wallet Balance
          </h2>
          <div className="flex items-center gap-2">
            {isLoadingBalance ? (
              <div className="flex items-center gap-1.5">
                <Shimmer width="120px" height="33px" variant="rectangle" />
                <Shimmer width="20px" height="20px" variant="circle" />
              </div>
            ) : parseFloat(assetBalance || '0') === 0 ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    trackEvent('mint_asset', { asset: assetSymbol })
                    onMintAsset?.()
                  }}
                  className="transition-all"
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#FF0420',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 500,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'Inter',
                    minHeight: '33px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  Get {displaySymbol}
                </button>
                <img
                  src={assetLogo}
                  alt={assetSymbol}
                  style={{
                    width: '20px',
                    height: '20px',
                  }}
                />
              </div>
            ) : (
              <div
                className="flex items-center gap-2"
                style={{
                  padding: '6px 12px',
                  backgroundColor:
                    hoveredAction === 'mint'
                      ? colors.highlight.background
                      : 'transparent',
                  borderRadius: '6px',
                  ...(hoveredAction === 'mint' && {
                    border: `1px solid ${colors.highlight.border}`,
                  }),
                  minHeight: '33px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    color: '#000',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  {displaySymbol === 'WETH' ? assetBalance : `$${assetBalance}`}
                </span>
                <img
                  src={assetLogo}
                  alt={assetSymbol}
                  style={{
                    width: '20px',
                    height: '20px',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #E0E2EB' }}></div>

      <div
        className="py-6 px-6"
        style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}
      >
        {isIlliquidAaveMarket && mode === 'withdraw' && (
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
        <div
          style={{
            display: 'flex',
            width: '100%',
            backgroundColor: '#F5F5F7',
            borderRadius: '10px',
            padding: '3px',
          }}
        >
          <button
            onClick={() => setMode('lend')}
            className="transition-all"
            style={{
              flex: 1,
              padding: '10px 32px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 500,
              fontFamily: 'Inter',
              cursor: 'pointer',
              backgroundColor:
                mode === 'lend'
                  ? '#FFFFFF'
                  : hoveredAction === 'deposit' && mode === 'withdraw'
                    ? colors.highlight.background
                    : 'transparent',
              color: mode === 'lend' ? '#000' : '#666',
              boxShadow:
                mode === 'lend' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
            }}
          >
            Lend
          </button>
          <button
            onClick={() => setMode('withdraw')}
            className="transition-all"
            style={{
              flex: 1,
              padding: '10px 32px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 500,
              fontFamily: 'Inter',
              cursor: 'pointer',
              backgroundColor:
                mode === 'withdraw'
                  ? '#FFFFFF'
                  : hoveredAction === 'withdraw' && mode === 'lend'
                    ? colors.highlight.background
                    : 'transparent',
              color: mode === 'withdraw' ? '#000' : '#666',
              boxShadow:
                mode === 'withdraw' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
            }}
          >
            Withdraw
          </button>
        </div>

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
            <button
              onClick={handleMaxClick}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '16px',
                fontWeight: 400,
                color: '#3374DB',
                cursor: 'pointer',
                backgroundColor: 'transparent',
              }}
            >
              Max
            </button>
          </div>
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
              value={amount}
              onChange={handleAmountChange}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: '16px',
                color: '#000',
                backgroundColor: 'transparent',
                fontFamily: 'Inter',
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

          {(() => {
            const maxAmount =
              mode === 'lend' ? assetBalance : depositedAmount || '0'
            const amountValue = parseFloat(amount)
            const exceedsAaveLimit =
              isIlliquidAaveMarket &&
              mode === 'withdraw' &&
              amountValue > AAVE_MAX_WITHDRAW
            const isDisabled =
              isLoading ||
              !amount ||
              amountValue <= 0 ||
              amountValue > parseFloat(maxAmount) ||
              exceedsAaveLimit

            return (
              <button
                onClick={handleLendUSDC}
                disabled={isDisabled}
                title={
                  exceedsAaveLimit
                    ? 'Cannot withdraw more than 0.0001 at a time.'
                    : undefined
                }
                className="w-full py-3 px-4 font-medium transition-all"
                style={{
                  backgroundColor: isDisabled ? '#D1D5DB' : '#FF0420',
                  color: isDisabled ? '#6B7280' : '#FFFFFF',
                  fontSize: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  opacity: 1,
                }}
              >
                {isLoading
                  ? 'Processing...'
                  : mode === 'lend'
                    ? `Lend ${displaySymbol}`
                    : `Withdraw ${displaySymbol}`}
              </button>
            )
          })()}
        </div>
      </div>

      <TransactionModal
        isOpen={modalOpen}
        status={modalStatus}
        onClose={handleModalClose}
        blockExplorerUrl={blockExplorerUrl}
        mode={mode}
      />
    </div>
  )
}
