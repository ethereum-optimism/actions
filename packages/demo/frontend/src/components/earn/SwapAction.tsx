import { useState, useEffect, useRef } from 'react'
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

function TokenSelector({
  assets,
  selectedIndex,
  onSelect,
  onPriceReset,
  otherIndex,
  setOtherIndex,
}: {
  assets: SwapActionProps['assets']
  selectedIndex: number
  onSelect: (index: number) => void
  onPriceReset: () => void
  otherIndex: number
  setOtherIndex: (index: number) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = assets[selectedIndex]
  const displaySymbol = selected?.asset.metadata.symbol.replace('_DEMO', '')

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderRadius: '20px',
          border: '1px solid #E0E2EB',
          backgroundColor: '#FFFFFF',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 600,
          color: '#1a1b1e',
          fontFamily: 'Inter',
        }}
      >
        <img
          src={selected?.logo}
          alt={displaySymbol}
          style={{ width: '24px', height: '24px', borderRadius: '50%' }}
        />
        {displaySymbol}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="#666666"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E0E2EB',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            zIndex: 20,
            minWidth: '160px',
            overflow: 'hidden',
          }}
        >
          {assets.map((asset, index) => {
            const symbol = asset.asset.metadata.symbol.replace('_DEMO', '')
            return (
              <button
                key={asset.asset.metadata.symbol}
                onClick={() => {
                  if (index === otherIndex) {
                    setOtherIndex(selectedIndex)
                  }
                  onSelect(index)
                  onPriceReset()
                  setIsOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px 16px',
                  border: 'none',
                  backgroundColor:
                    index === selectedIndex ? '#F5F5F7' : '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#1a1b1e',
                  fontFamily: 'Inter',
                }}
              >
                <img
                  src={asset.logo}
                  alt={symbol}
                  style={{ width: '20px', height: '20px', borderRadius: '50%' }}
                />
                {symbol}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatUsdValue(
  amount: string,
  symbol: string,
  priceQuote: { price: string } | null,
): string | null {
  const parsed = parseFloat(amount)
  if (!parsed || parsed <= 0) return null
  const cleanSymbol = symbol.replace('_DEMO', '')
  if (cleanSymbol === 'USDC') return `$${parsed.toFixed(2)}`
  if (priceQuote) {
    const usdValue = parsed * parseFloat(priceQuote.price)
    if (usdValue > 0) return `$${usdValue.toFixed(2)}`
  }
  return null
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

  // USD display values
  const sellUsd = assetIn
    ? formatUsdValue(amountIn, assetIn.asset.metadata.symbol, null)
    : null
  const buyUsd =
    assetOut && priceQuote
      ? formatUsdValue(
          priceQuote.amountOutFormatted,
          assetOut.asset.metadata.symbol,
          null,
        )
      : null

  if (assets.length < 2) {
    return (
      <div
        className="w-full p-6"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E0E2EB',
          borderRadius: '24px',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.06)',
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
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.06)',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Sell Section */}
      <div className="p-6">
        <div
          style={{
            backgroundColor: '#F9FAFB',
            borderRadius: '16px',
            padding: '20px',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span style={{ color: '#9195A6', fontSize: '14px' }}>Sell</span>
            <div className="flex items-center gap-1">
              {isLoadingBalances ? (
                <Shimmer width="80px" height="16px" variant="rectangle" />
              ) : (
                <>
                  <span style={{ color: '#9195A6', fontSize: '14px' }}>
                    {assetIn?.balance || '0'}{' '}
                    {assetIn?.asset.metadata.symbol.replace('_DEMO', '')}
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
          </div>
          <div className="flex items-center justify-between">
            <div style={{ flex: 1 }}>
              <input
                type="text"
                placeholder="0"
                value={amountIn}
                onChange={handleAmountChange}
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  fontSize: '32px',
                  fontWeight: 500,
                  color: '#000',
                  backgroundColor: 'transparent',
                  fontFamily: 'Inter',
                }}
              />
              {sellUsd && (
                <span
                  style={{
                    color: '#9195A6',
                    fontSize: '14px',
                    marginTop: '2px',
                    display: 'block',
                  }}
                >
                  {sellUsd}
                </span>
              )}
            </div>
            <TokenSelector
              assets={assets}
              selectedIndex={assetInIndex}
              onSelect={setAssetInIndex}
              onPriceReset={() => setPriceQuote(null)}
              otherIndex={assetOutIndex}
              setOtherIndex={setAssetOutIndex}
            />
          </div>
        </div>
      </div>

      {/* Down Arrow Divider */}
      <div className="flex justify-center -my-3 relative z-10">
        <button
          onClick={handleFlipAssets}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            border: '1px solid #E0E2EB',
            backgroundColor: '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 3V13M8 13L4 9M8 13L12 9"
              stroke="#666666"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Buy Section */}
      <div className="p-6" style={{ borderTop: '1px solid #E0E2EB' }}>
        <div
          style={{
            backgroundColor: '#F9FAFB',
            borderRadius: '16px',
            padding: '20px',
            border: '1px dashed #E0E2EB',
          }}
        >
          <span
            style={{
              color: '#9195A6',
              fontSize: '14px',
              display: 'block',
              marginBottom: '12px',
            }}
          >
            Buy
          </span>
          <div className="flex items-center justify-between">
            <div style={{ flex: 1 }}>
              <input
                type="text"
                placeholder="0"
                value={
                  isLoadingPrice ? '...' : priceQuote?.amountOutFormatted || ''
                }
                readOnly
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  fontSize: '32px',
                  fontWeight: 500,
                  color: '#000',
                  backgroundColor: 'transparent',
                  fontFamily: 'Inter',
                }}
              />
              {buyUsd && (
                <span
                  style={{
                    color: '#9195A6',
                    fontSize: '14px',
                    marginTop: '2px',
                    display: 'block',
                  }}
                >
                  {buyUsd}
                </span>
              )}
            </div>
            <TokenSelector
              assets={assets}
              selectedIndex={assetOutIndex}
              onSelect={setAssetOutIndex}
              onPriceReset={() => setPriceQuote(null)}
              otherIndex={assetInIndex}
              setOtherIndex={setAssetInIndex}
            />
          </div>
        </div>
      </div>

      {/* Review Button */}
      <div className="px-6 pb-6">
        <button
          onClick={handleSwap}
          disabled={isActionDisabled}
          className="w-full py-4 px-4 font-semibold transition-all"
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
              : 'Review'}
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
