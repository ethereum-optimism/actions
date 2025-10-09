import { useState, useEffect, useCallback, useRef } from 'react'
import { useLoggedActionsApi } from '../hooks/useLoggedActionsApi'
import { useUser, usePrivy } from '@privy-io/react-auth'
import type { Address } from 'viem'
import TransactionModal from './TransactionModal'
import { actionsApi } from '../api/actionsApi'

interface ActionProps {
  usdcBalance: string
  isLoadingBalance: boolean
  onMintUSDC?: () => void
  onTransactionSuccess?: () => void
}

function Action({ usdcBalance, isLoadingBalance, onMintUSDC, onTransactionSuccess }: ActionProps) {
  const loggedApi = useLoggedActionsApi()
  const { user } = useUser()
  const { getAccessToken } = usePrivy()
  const [isLoading, setIsLoading] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [mode, setMode] = useState<'lend' | 'withdraw'>('lend')
  const [apy, setApy] = useState<number | null>(null)
  const [isLoadingApy, setIsLoadingApy] = useState(true)
  const [amount, setAmount] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStatus, setModalStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [transactionHash, setTransactionHash] = useState<string | undefined>(undefined)
  const [blockExplorerUrl, setBlockExplorerUrl] = useState<string | undefined>(undefined)
  const [marketData, setMarketData] = useState<{
    marketId: { chainId: number; address: Address }
    assetAddress: Address
  } | null>(null)
  const [depositedAmount, setDepositedAmount] = useState<string | null>(null)
  const [isLoadingPosition, setIsLoadingPosition] = useState(false)

  // Fetch market APY on mount
  useEffect(() => {
    const fetchMarketApy = async () => {
      try {
        setIsLoadingApy(true)
        const result = await loggedApi.getMarkets()

        // Get the USDC Demo Vault (Base Sepolia) at index 1
        if (result.markets.length > 1) {
          const market = result.markets[1]
          setApy(market.apy.total)

          // Store market data for transactions
          const assetAddress = (market.asset.address[market.marketId.chainId] ||
            Object.values(market.asset.address)[0]) as Address

          setMarketData({
            marketId: market.marketId,
            assetAddress
          })
        }
      } catch {
        // Error fetching market APY
      } finally {
        setIsLoadingApy(false)
      }
    }

    fetchMarketApy()
  }, [loggedApi])

  const handleMaxClick = () => {
    setAmount(mode === 'lend' ? usdcBalance : depositedAmount || '0')
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Allow only numbers and decimals
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value)
    }
  }

  const handleLendUSDC = async () => {
    if (!user?.id || !marketData || !amount || parseFloat(amount) <= 0) {
      return
    }

    const amountValue = parseFloat(amount)
    const maxAmount = mode === 'lend' ? parseFloat(usdcBalance) : parseFloat(depositedAmount || '0')
    if (amountValue > maxAmount) {
      return
    }

    setIsLoading(true)
    setModalOpen(true)
    setModalStatus('loading')
    setTransactionHash(undefined)
    setBlockExplorerUrl(undefined)

    try {
      const token = await getAccessToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined

      const result = mode === 'lend'
        ? await loggedApi.openLendPosition(
            user.id,
            amountValue,
            marketData.assetAddress,
            marketData.marketId,
            headers
          )
        : await loggedApi.closeLendPosition(
            user.id,
            amountValue,
            marketData.assetAddress,
            marketData.marketId,
            headers
          )

      // Get the first transaction hash if available, or use userOpHash for account abstraction
      const txHash = result.transaction.transactionHashes?.[0] || result.transaction.userOpHash
      setTransactionHash(txHash)

      // Use the block explorer URL from the backend (first one in the array)
      const explorerUrl = result.transaction.blockExplorerUrls?.[0]
      setBlockExplorerUrl(explorerUrl)
      setModalStatus('success')
      setAmount('')

      // Refresh position after successful transaction with a small delay to ensure state is updated
      setTimeout(async () => {
        if (user?.id && marketData) {
          try {
            const position = await actionsApi.getPosition(marketData.marketId, user.id)
            setDepositedAmount(position.balanceFormatted)
          } catch {
            setDepositedAmount('0.00')
          }
        }
      }, 1000)

      if (onTransactionSuccess) {
        onTransactionSuccess()
      }
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

  // Extract primitive values to avoid unnecessary re-renders
  const marketChainId = marketData?.marketId.chainId
  const marketAddress = marketData?.marketId.address

  // Fetch position when market data is available or user changes
  useEffect(() => {
    const fetchPosition = async () => {
      if (!user?.id || !marketChainId || !marketAddress) return

      try {
        setIsLoadingPosition(true)
        const position = await actionsApi.getPosition(
          { chainId: marketChainId, address: marketAddress },
          user.id
        )
        setDepositedAmount(position.balanceFormatted)
      } catch {
        setDepositedAmount('0.00')
      } finally {
        setIsLoadingPosition(false)
      }
    }

    if (user?.id && marketChainId && marketAddress) {
      fetchPosition()
    }
  }, [user?.id, marketChainId, marketAddress])

  return (
    <div
      className="w-full"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E2EB',
        borderRadius: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}
    >
      <div className="py-6 px-6">
        <h2
          className="font-semibold"
          style={{ color: '#1a1b1e', fontSize: '16px', marginBottom: '12px' }}
        >
          Wallet Balance
        </h2>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/usd-coin-usdc-logo.svg"
              alt="USDC"
              style={{
                width: '20px',
                height: '20px'
              }}
            />
            <span style={{
              color: '#000',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontStyle: 'normal',
              fontWeight: 400,
              lineHeight: '20px'
            }}>
              USDC
            </span>
          </div>
          {isLoadingBalance ? (
            <span style={{
              color: '#404454',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 500
            }}>
              Loading...
            </span>
          ) : !usdcBalance || usdcBalance === '0.00' || usdcBalance === '0' || parseFloat(usdcBalance || '0') === 0 ? (
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
                fontFamily: 'Inter'
              }}
            >
              Get 100 USDC
            </button>
          ) : (
            <span style={{
              color: '#404454',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 500
            }}>
              {usdcBalance} USDC
            </span>
          )}
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #E0E2EB' }}></div>

      <div className="py-6 px-6" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ position: 'relative' }}>
            <span style={{
              color: '#000',
              fontSize: '14px',
            }}>
              Demo APY
            </span>
            <div
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#666666"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {showTooltip && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%) translateY(-8px)',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(0, 0, 0, 0.56)',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}>
                  For demo only. Real APYs vary by market and provider.
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 0,
                    height: 0,
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderTop: '4px solid rgba(0, 0, 0, 0.56)'
                  }} />
                </div>
              )}
            </div>
          </div>
          <span style={{
            color:  '#000',
            fontFamily: 'Inter',
            fontSize: '14px',
            fontWeight: 500
          }}>
            {isLoadingApy ? 'Loading...' : apy !== null ? `${(apy * 100).toFixed(2)}%` : '0.00%'}
          </span>
        </div>

        <div style={{
          display: 'flex',
          width: '100%',
          backgroundColor: '#F5F5F7',
          borderRadius: '10px',
          padding: '3px',
        }}>
          <button
            onClick={() => setMode('lend')}
            style={{
              flex: 1,
              padding: '10px 32px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 500,
              fontFamily: 'Inter',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: mode === 'lend' ? '#FFFFFF' : 'transparent',
              color: mode === 'lend' ? '#000' : '#666',
              boxShadow: mode === 'lend' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none'
            }}
          >
            Lend
          </button>
          <button
            onClick={() => setMode('withdraw')}
            style={{
              flex: 1,
              padding: '10px 32px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 500,
              fontFamily: 'Inter',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: mode === 'withdraw' ? '#FFFFFF' : 'transparent',
              color: mode === 'withdraw' ? '#000' : '#666',
              boxShadow: mode === 'withdraw' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none'
            }}
          >
            Withdraw
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{
              color: '#000',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontStyle: 'normal',
              fontWeight: 400,
              lineHeight: '20px'
            }}>
              Your Deposited Assets
            </span>
            <span style={{
              color: '#9195A6',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 400
            }}>
              Principal + Interest
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{
              color: '#000',
              fontSize: '14px',
              fontWeight: 500
            }}>
              {isLoadingPosition || depositedAmount === null ? 'Loading...' : `${depositedAmount} USDC`}
            </span>
            <img
              src="/usd-coin-usdc-logo.svg"
              alt="USDC"
              style={{
                width: '20px',
                height: '20px'
              }}
            />
          </div>
        </div>

        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <label style={{
              color: '#0F111A',
              fontSize: '16px',
              fontWeight: 600,
              display: 'block'
            }}>
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
                backgroundColor: 'transparent'
              }}
            >
              Max
            </button>
          </div>
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            border: '1px solid #E0E2EB',
            borderRadius: '12px',
            padding: '12px 16px',
            backgroundColor: '#FFFFFF'
          }}>
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
                fontFamily: 'Inter'
              }}
            />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              paddingLeft: '12px',
              borderLeft: '1px solid #E0E2EB'
            }}>
              <span style={{
                color: '#9195A6',
                fontSize: '14px',
                fontWeight: 600,
                fontFamily: 'Inter'
              }}>
                USDC
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleLendUSDC}
          disabled={isLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > parseFloat(mode === 'lend' ? usdcBalance : depositedAmount || '0')}
          className="w-full py-3 px-4 font-medium transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: '#FF0420',
            color: '#FFFFFF',
            fontSize: '16px',
            borderRadius: '12px',
            border: 'none',
            cursor: isLoading || !amount || parseFloat(amount) <= 0 ? 'not-allowed' : 'pointer'
          }}
        >
          {isLoading ? 'Processing...' : (mode === 'lend' ? 'Lend USDC' : 'Withdraw USDC')}
        </button>
      </div>

      <TransactionModal
        isOpen={modalOpen}
        status={modalStatus}
        onClose={handleModalClose}
        transactionHash={transactionHash}
        blockExplorerUrl={blockExplorerUrl}
      />
    </div>
  )
}

export default Action