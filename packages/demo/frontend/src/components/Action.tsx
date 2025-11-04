import { useState } from 'react'
import TransactionModal from './TransactionModal'
import Shimmer from './Shimmer'
import { useActivityHighlight } from '../contexts/ActivityHighlightContext'
import { colors } from '../constants/colors'

interface ActionProps {
  usdcBalance: string
  isLoadingBalance: boolean
  depositedAmount: string | null
  onMintUSDC?: () => void
  onTransaction: (
    mode: 'lend' | 'withdraw',
    amount: number,
  ) => Promise<{
    transactionHash?: string
    blockExplorerUrl?: string
  }>
}

/**
 * Presentational component for the Action card
 * Handles UI state and user interactions, delegates business logic to container
 */
export function Action({
  usdcBalance,
  isLoadingBalance,
  depositedAmount,
  onMintUSDC,
  onTransaction,
}: ActionProps) {
  const { hoveredAction } = useActivityHighlight()
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<'lend' | 'withdraw'>('lend')
  const [amount, setAmount] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStatus, setModalStatus] = useState<
    'loading' | 'success' | 'error'
  >('loading')
  const [transactionHash, setTransactionHash] = useState<string | undefined>(
    undefined,
  )
  const [blockExplorerUrl, setBlockExplorerUrl] = useState<string | undefined>(
    undefined,
  )

  const handleMaxClick = () => {
    const maxAmount = mode === 'lend' ? usdcBalance : depositedAmount || '0'
    const rounded = parseFloat(maxAmount).toFixed(2)
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
        ? parseFloat(usdcBalance)
        : parseFloat(depositedAmount || '0')
    if (amountValue > maxAmount) {
      return
    }

    setIsLoading(true)
    setModalOpen(true)
    setModalStatus('loading')
    setTransactionHash(undefined)
    setBlockExplorerUrl(undefined)

    try {
      const result = await onTransaction(mode, amountValue)

      setTransactionHash(result.transactionHash)
      setBlockExplorerUrl(result.blockExplorerUrl)
      setModalStatus('success')
      setAmount('')
    } catch {
      setModalStatus('error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setModalStatus('loading')
    setTransactionHash(undefined)
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
              <Shimmer width="60px" height="20px" borderRadius="4px" />
            ) : !usdcBalance ||
              usdcBalance === '0.00' ||
              usdcBalance === '0' ||
              parseFloat(usdcBalance || '0') === 0 ? (
              <button
                onClick={onMintUSDC}
                className="flex items-center gap-1.5 py-1.5 px-3 transition-all hover:bg-gray-50"
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#1a1b1e',
                  fontSize: '14px',
                  fontWeight: 500,
                  borderRadius: '6px',
                  border: '1px solid #E0E2EB',
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                }}
              >
                Get 100 USDC
              </button>
            ) : (
              <span
                style={{
                  color: '#000',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                ${usdcBalance}
              </span>
            )}
            <img
              src="/usd-coin-usdc-logo.svg"
              alt="USDC"
              style={{
                width: '20px',
                height: '20px',
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #E0E2EB' }}></div>

      <div
        className="py-6 px-6"
        style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}
      >
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
                USDC
              </span>
            </div>
          </div>

          <button
            onClick={handleLendUSDC}
            disabled={
              isLoading ||
              !amount ||
              parseFloat(amount) <= 0 ||
              parseFloat(amount) >
                parseFloat(
                  mode === 'lend' ? usdcBalance : depositedAmount || '0',
                )
            }
            className="w-full py-3 px-4 font-medium transition-all"
            style={{
              backgroundColor:
                isLoading ||
                !amount ||
                parseFloat(amount) <= 0 ||
                parseFloat(amount) >
                  parseFloat(
                    mode === 'lend' ? usdcBalance : depositedAmount || '0',
                  )
                  ? '#D1D5DB'
                  : '#FF0420',
              color:
                isLoading ||
                !amount ||
                parseFloat(amount) <= 0 ||
                parseFloat(amount) >
                  parseFloat(
                    mode === 'lend' ? usdcBalance : depositedAmount || '0',
                  )
                  ? '#6B7280'
                  : '#FFFFFF',
              fontSize: '16px',
              borderRadius: '12px',
              border: 'none',
              cursor:
                isLoading ||
                !amount ||
                parseFloat(amount) <= 0 ||
                parseFloat(amount) >
                  parseFloat(
                    mode === 'lend' ? usdcBalance : depositedAmount || '0',
                  )
                  ? 'not-allowed'
                  : 'pointer',
              opacity: 1,
            }}
          >
            {isLoading
              ? 'Processing...'
              : mode === 'lend'
                ? 'Lend USDC'
                : 'Withdraw USDC'}
          </button>
        </div>
      </div>

      <TransactionModal
        isOpen={modalOpen}
        status={modalStatus}
        onClose={handleModalClose}
        transactionHash={transactionHash}
        blockExplorerUrl={blockExplorerUrl}
        mode={mode}
      />
    </div>
  )
}
