import { useState, useEffect } from 'react'
import type { Asset, SupportedChainId } from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

import TransactionModal from './TransactionModal'
import Shimmer from './Shimmer'
import { trackEvent } from '@/utils/analytics'

interface SwapActionProps {
  assets: Array<{
    asset: Asset
    logo: string
    balance: string
    chainId: SupportedChainId
  }>
  isLoadingBalances: boolean
  onSwap: (params: {
    amountIn: number
    tokenInAddress: Address
    tokenOutAddress: Address
    chainId: SupportedChainId
  }) => Promise<{
    blockExplorerUrl?: string
  }>
  onGetPrice: (params: {
    tokenInAddress: Address
    tokenOutAddress: Address
    chainId: SupportedChainId
    amountIn?: number
  }) => Promise<{
    price: string
    priceImpact: number
    amountOutFormatted: string
  } | null>
  isExecuting: boolean
}

export function SwapAction({
  assets,
  isLoadingBalances,
  onSwap,
  onGetPrice,
  isExecuting,
}: SwapActionProps) {
  const [assetInIndex, setAssetInIndex] = useState(0)
  const [assetOutIndex, setAssetOutIndex] = useState(1)
  const [amountIn, setAmountIn] = useState('')
  const [priceQuote, setPriceQuote] = useState<{
    price: string
    priceImpact: number
    amountOutFormatted: string
  } | null>(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStatus, setModalStatus] = useState<
    'loading' | 'success' | 'error'
  >('loading')
  const [blockExplorerUrl, setBlockExplorerUrl] = useState<string | undefined>(
    undefined,
  )

  const assetIn = assets[assetInIndex]
  const assetOut = assets[assetOutIndex]

  // Fetch price when amount changes
  useEffect(() => {
    const fetchPrice = async () => {
      if (!amountIn || parseFloat(amountIn) <= 0 || !assetIn || !assetOut) {
        setPriceQuote(null)
        return
      }

      setIsLoadingPrice(true)
      try {
        const quote = await onGetPrice({
          tokenInAddress: assetIn.asset.address[assetIn.chainId] as Address,
          tokenOutAddress: assetOut.asset.address[assetOut.chainId] as Address,
          chainId: assetIn.chainId,
          amountIn: parseFloat(amountIn),
        })
        setPriceQuote(quote)
      } catch {
        setPriceQuote(null)
      } finally {
        setIsLoadingPrice(false)
      }
    }

    const debounce = setTimeout(fetchPrice, 500)
    return () => clearTimeout(debounce)
  }, [amountIn, assetIn, assetOut, onGetPrice])

  const handleFlipAssets = () => {
    setAssetInIndex(assetOutIndex)
    setAssetOutIndex(assetInIndex)
    setAmountIn('')
    setPriceQuote(null)
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmountIn(value)
    }
  }

  const handleMaxClick = () => {
    if (assetIn) {
      setAmountIn(assetIn.balance)
    }
  }

  const handleSwap = async () => {
    if (!amountIn || parseFloat(amountIn) <= 0 || !assetIn || !assetOut) return

    trackEvent('swap_initiated', {
      assetIn: assetIn.asset.metadata.symbol,
      assetOut: assetOut.asset.metadata.symbol,
      amount: parseFloat(amountIn),
    })

    setModalOpen(true)
    setModalStatus('loading')
    setBlockExplorerUrl(undefined)

    try {
      const result = await onSwap({
        amountIn: parseFloat(amountIn),
        tokenInAddress: assetIn.asset.address[assetIn.chainId] as Address,
        tokenOutAddress: assetOut.asset.address[assetOut.chainId] as Address,
        chainId: assetIn.chainId,
      })

      setBlockExplorerUrl(result.blockExplorerUrl)
      setModalStatus('success')
      setAmountIn('')
      setPriceQuote(null)

      trackEvent('swap_success', {
        assetIn: assetIn.asset.metadata.symbol,
        assetOut: assetOut.asset.metadata.symbol,
        amount: parseFloat(amountIn),
      })
    } catch {
      setModalStatus('error')
      trackEvent('swap_error', {
        assetIn: assetIn.asset.metadata.symbol,
        assetOut: assetOut.asset.metadata.symbol,
        amount: parseFloat(amountIn),
      })
    }
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setModalStatus('loading')
    setBlockExplorerUrl(undefined)
  }

  const amountValue = parseFloat(amountIn) || 0
  const maxAmount = parseFloat(assetIn?.balance || '0')
  const isActionDisabled =
    isExecuting ||
    !amountIn ||
    amountValue <= 0 ||
    amountValue > maxAmount ||
    !priceQuote

  if (assets.length < 2) {
    return (
      <div
        className="w-full p-6"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E0E2EB',
          borderRadius: '24px',
        }}
      >
        <p style={{ color: '#666666' }}>
          At least two assets are required for swapping.
        </p>
      </div>
    )
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
      {/* You Pay Section */}
      <div className="py-6 px-6">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="font-semibold"
            style={{ color: '#1a1b1e', fontSize: '16px' }}
          >
            You Pay
          </h2>
          <div className="flex items-center gap-2">
            {isLoadingBalances ? (
              <Shimmer width="80px" height="20px" variant="rectangle" />
            ) : (
              <span style={{ color: '#666666', fontSize: '14px' }}>
                Balance: {assetIn?.balance || '0'}
              </span>
            )}
            <button
              onClick={handleMaxClick}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 500,
                color: '#3374DB',
                cursor: 'pointer',
                backgroundColor: 'transparent',
              }}
            >
              Max
            </button>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            border: '1px solid #E0E2EB',
            borderRadius: '12px',
            padding: '12px 16px',
            backgroundColor: '#FFFFFF',
          }}
        >
          <input
            type="text"
            placeholder="0"
            value={amountIn}
            onChange={handleAmountChange}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '24px',
              color: '#000',
              backgroundColor: 'transparent',
              fontFamily: 'Inter',
            }}
          />
          <select
            value={assetInIndex}
            onChange={(e) => {
              const newIndex = parseInt(e.target.value)
              if (newIndex === assetOutIndex) {
                setAssetOutIndex(assetInIndex)
              }
              setAssetInIndex(newIndex)
              setPriceQuote(null)
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #E0E2EB',
              backgroundColor: '#F5F5F7',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {assets.map((asset, index) => (
              <option key={asset.asset.metadata.symbol} value={index}>
                {asset.asset.metadata.symbol.replace('_DEMO', '')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Swap Direction Button */}
      <div className="flex justify-center -my-3 relative z-10">
        <button
          onClick={handleFlipAssets}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            border: '1px solid #E0E2EB',
            backgroundColor: '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
          }}
        >
          ⇅
        </button>
      </div>

      {/* You Receive Section */}
      <div className="py-6 px-6" style={{ borderTop: '1px solid #E0E2EB' }}>
        <div className="flex items-center justify-between mb-4">
          <h2
            className="font-semibold"
            style={{ color: '#1a1b1e', fontSize: '16px' }}
          >
            You Receive
          </h2>
          <div className="flex items-center gap-2">
            {isLoadingBalances ? (
              <Shimmer width="80px" height="20px" variant="rectangle" />
            ) : (
              <span style={{ color: '#666666', fontSize: '14px' }}>
                Balance: {assetOut?.balance || '0'}
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            border: '1px solid #E0E2EB',
            borderRadius: '12px',
            padding: '12px 16px',
            backgroundColor: '#F9FAFB',
          }}
        >
          <input
            type="text"
            placeholder="0"
            value={
              isLoadingPrice ? '...' : priceQuote?.amountOutFormatted || ''
            }
            readOnly
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '24px',
              color: '#666666',
              backgroundColor: 'transparent',
              fontFamily: 'Inter',
            }}
          />
          <select
            value={assetOutIndex}
            onChange={(e) => {
              const newIndex = parseInt(e.target.value)
              if (newIndex === assetInIndex) {
                setAssetInIndex(assetOutIndex)
              }
              setAssetOutIndex(newIndex)
              setPriceQuote(null)
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #E0E2EB',
              backgroundColor: '#F5F5F7',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {assets.map((asset, index) => (
              <option key={asset.asset.metadata.symbol} value={index}>
                {asset.asset.metadata.symbol.replace('_DEMO', '')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Price Info */}
      {priceQuote && (
        <div className="px-6 pb-4">
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#F9FAFB',
              borderRadius: '12px',
              fontSize: '14px',
            }}
          >
            <div className="flex justify-between mb-2">
              <span style={{ color: '#666666' }}>Rate</span>
              <span style={{ color: '#000' }}>
                1 {assetIn?.asset.metadata.symbol.replace('_DEMO', '')} ={' '}
                {priceQuote.price}{' '}
                {assetOut?.asset.metadata.symbol.replace('_DEMO', '')}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#666666' }}>Price Impact</span>
              <span
                style={{
                  color: priceQuote.priceImpact > 0.01 ? '#F59E0B' : '#000',
                }}
              >
                {(priceQuote.priceImpact * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Swap Button */}
      <div className="px-6 pb-6">
        <button
          onClick={handleSwap}
          disabled={isActionDisabled}
          className="w-full py-3 px-4 font-medium transition-all"
          style={{
            backgroundColor: isActionDisabled ? '#D1D5DB' : '#FF0420',
            color: isActionDisabled ? '#6B7280' : '#FFFFFF',
            fontSize: '16px',
            borderRadius: '12px',
            border: 'none',
            cursor: isActionDisabled ? 'not-allowed' : 'pointer',
            opacity: 1,
          }}
        >
          {isExecuting
            ? 'Swapping...'
            : isLoadingPrice
              ? 'Getting Quote...'
              : 'Swap'}
        </button>
      </div>

      <TransactionModal
        isOpen={modalOpen}
        status={modalStatus}
        onClose={handleModalClose}
        blockExplorerUrl={blockExplorerUrl}
        mode="swap"
        assetSymbol={`${assetIn?.asset.metadata.symbol.replace('_DEMO', '')} → ${assetOut?.asset.metadata.symbol.replace('_DEMO', '')}`}
      />
    </div>
  )
}
