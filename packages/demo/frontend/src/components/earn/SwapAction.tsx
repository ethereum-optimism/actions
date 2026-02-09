import { useState, useEffect, useCallback } from 'react'
import type { Asset, SupportedChainId } from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

import TransactionModal from './TransactionModal'
import Shimmer from './Shimmer'
import { Toast } from './Toast'
import { trackEvent } from '@/utils/analytics'

interface SwapAsset {
  asset: Asset
  logo: string
  balance: string
  chainId: SupportedChainId
}

interface SwapActionProps {
  assets: SwapAsset[]
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

const TOKEN_NAMES: Record<string, string> = {
  ETH: 'Ethereum',
  WETH: 'Wrapped Ether',
  USDC: 'USD Coin',
  OP: 'Optimism',
}

function getTokenName(symbol: string): string {
  const clean = symbol.replace('_DEMO', '')
  return TOKEN_NAMES[clean] || clean
}

function displaySymbol(symbol: string): string {
  return symbol.replace('_DEMO', '')
}

function formatUsd(amount: string, symbol: string): string | null {
  const parsed = parseFloat(amount)
  if (!parsed || parsed <= 0) return null
  if (displaySymbol(symbol) === 'USDC') return `$${parsed.toFixed(2)}`
  return null
}

// --- Token Select Modal ---

function TokenSelectModal({
  isOpen,
  onClose,
  assets,
  onSelect,
}: {
  isOpen: boolean
  onClose: () => void
  assets: SwapAsset[]
  onSelect: (index: number) => void
}) {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '420px',
          maxHeight: '80vh',
          overflow: 'auto',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: '20px 24px 16px' }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1b1e' }}>
            Select a token
          </h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: '#666666',
              fontSize: '20px',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        <div style={{ padding: '0 8px 8px' }}>
          {assets.map((asset, index) => {
            const symbol = displaySymbol(asset.asset.metadata.symbol)
            const name = getTokenName(asset.asset.metadata.symbol)
            const balance = asset.balance
            const usdValue =
              symbol === 'USDC'
                ? `$${parseFloat(balance).toFixed(2)}`
                : `$${parseFloat(balance).toFixed(2)}`

            return (
              <button
                key={asset.asset.metadata.symbol}
                onClick={() => {
                  onSelect(index)
                  onClose()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '12px',
                  fontFamily: 'Inter',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <img
                  src={asset.logo}
                  alt={symbol}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    marginRight: '12px',
                  }}
                />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 500,
                      color: '#1a1b1e',
                    }}
                  >
                    {name}
                  </div>
                  <div style={{ fontSize: '14px', color: '#9195A6' }}>
                    {symbol}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 500,
                      color: '#1a1b1e',
                    }}
                  >
                    {usdValue}
                  </div>
                  <div style={{ fontSize: '14px', color: '#9195A6' }}>
                    {balance}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// --- Token Button (opens modal) ---

function TokenButton({
  asset,
  onClick,
}: {
  asset: SwapAsset
  onClick: () => void
}) {
  const symbol = displaySymbol(asset.asset.metadata.symbol)

  return (
    <button
      onClick={onClick}
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
        flexShrink: 0,
      }}
    >
      <img
        src={asset.logo}
        alt={symbol}
        style={{ width: '24px', height: '24px', borderRadius: '50%' }}
      />
      {symbol}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M3 4.5L6 7.5L9 4.5"
          stroke="#666666"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

// --- Review Swap Modal ---

function ReviewSwapModal({
  isOpen,
  onClose,
  onConfirm,
  assetIn,
  assetOut,
  amountIn,
  amountOut,
  priceQuote,
  isExecuting,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  assetIn: SwapAsset
  assetOut: SwapAsset
  amountIn: string
  amountOut: string
  priceQuote: { price: string; priceImpact: number } | null
  isExecuting: boolean
}) {
  if (!isOpen) return null

  const symbolIn = displaySymbol(assetIn.asset.metadata.symbol)
  const symbolOut = displaySymbol(assetOut.asset.metadata.symbol)
  const usdIn = formatUsd(amountIn, assetIn.asset.metadata.symbol)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '420px',
          padding: '24px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: '24px' }}
        >
          <div style={{ width: '24px' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1b1e' }}>
            Review swap
          </h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: '#666666',
              fontSize: '20px',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* You pay */}
        <div style={{ marginBottom: '4px' }}>
          <span style={{ fontSize: '14px', color: '#9195A6' }}>You pay</span>
          <div className="flex items-center justify-between">
            <span
              style={{ fontSize: '32px', fontWeight: 500, color: '#1a1b1e' }}
            >
              {amountIn}
            </span>
            <img
              src={assetIn.logo}
              alt={symbolIn}
              style={{ width: '32px', height: '32px', borderRadius: '50%' }}
            />
          </div>
          {usdIn && (
            <span style={{ fontSize: '14px', color: '#9195A6' }}>{usdIn}</span>
          )}
        </div>

        {/* Arrow */}
        <div style={{ padding: '8px 0' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 3V13M8 13L4 9M8 13L12 9"
              stroke="#9195A6"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* You receive */}
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '14px', color: '#9195A6' }}>
            You receive
          </span>
          <div className="flex items-center justify-between">
            <span
              style={{ fontSize: '32px', fontWeight: 500, color: '#1a1b1e' }}
            >
              {amountOut}
            </span>
            <img
              src={assetOut.logo}
              alt={symbolOut}
              style={{ width: '32px', height: '32px', borderRadius: '50%' }}
            />
          </div>
        </div>

        {/* Details */}
        {priceQuote && (
          <div
            style={{
              borderTop: '1px solid #E0E2EB',
              paddingTop: '16px',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              fontSize: '14px',
            }}
          >
            <div className="flex justify-between">
              <span style={{ color: '#666666' }}>Exchange rate</span>
              <span style={{ color: '#1a1b1e' }}>
                1 {symbolIn} = {priceQuote.price} {symbolOut}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#666666' }}>Price impact</span>
              <span
                style={{
                  color: priceQuote.priceImpact > 0.01 ? '#F59E0B' : '#1a1b1e',
                }}
              >
                {priceQuote.priceImpact > 0
                  ? `-${(priceQuote.priceImpact * 100).toFixed(3)}%`
                  : `${(priceQuote.priceImpact * 100).toFixed(3)}%`}
              </span>
            </div>
          </div>
        )}

        {/* Swap button */}
        <button
          onClick={onConfirm}
          disabled={isExecuting}
          className="w-full py-4 px-4 font-semibold transition-all"
          style={{
            backgroundColor: isExecuting ? '#D1D5DB' : '#FF0420',
            color: isExecuting ? '#6B7280' : '#FFFFFF',
            fontSize: '16px',
            borderRadius: '12px',
            border: 'none',
            cursor: isExecuting ? 'not-allowed' : 'pointer',
          }}
        >
          {isExecuting ? 'Swapping...' : 'Swap'}
        </button>
      </div>
    </div>
  )
}

// --- Main SwapAction ---

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

  // Modal states
  const [tokenSelectTarget, setTokenSelectTarget] = useState<
    'in' | 'out' | null
  >(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [txModalOpen, setTxModalOpen] = useState(false)
  const [txModalStatus, setTxModalStatus] = useState<
    'loading' | 'success' | 'error'
  >('loading')
  const [blockExplorerUrl, setBlockExplorerUrl] = useState<string | undefined>(
    undefined,
  )

  // Toast state
  const [toast, setToast] = useState<{
    visible: boolean
    title: string
    description: string
  }>({ visible: false, title: '', description: '' })

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

  const handleTokenSelect = useCallback(
    (index: number) => {
      if (tokenSelectTarget === 'in') {
        if (index === assetOutIndex) setAssetOutIndex(assetInIndex)
        setAssetInIndex(index)
      } else {
        if (index === assetInIndex) setAssetInIndex(assetOutIndex)
        setAssetOutIndex(index)
      }
      setPriceQuote(null)
    },
    [tokenSelectTarget, assetInIndex, assetOutIndex],
  )

  const handleReview = () => {
    if (!amountIn || parseFloat(amountIn) <= 0 || !priceQuote) return
    setReviewOpen(true)
  }

  const handleConfirmSwap = async () => {
    if (!amountIn || parseFloat(amountIn) <= 0 || !assetIn || !assetOut) return

    const inSymbol = displaySymbol(assetIn.asset.metadata.symbol)
    const outSymbol = displaySymbol(assetOut.asset.metadata.symbol)
    const outAmount = priceQuote?.amountOutFormatted || ''

    trackEvent('swap_initiated', {
      assetIn: assetIn.asset.metadata.symbol,
      assetOut: assetOut.asset.metadata.symbol,
      amount: parseFloat(amountIn),
    })

    setReviewOpen(false)
    setTxModalOpen(true)
    setTxModalStatus('loading')
    setBlockExplorerUrl(undefined)

    try {
      const result = await onSwap({
        amountIn: parseFloat(amountIn),
        tokenInAddress: assetIn.asset.address[assetIn.chainId] as Address,
        tokenOutAddress: assetOut.asset.address[assetOut.chainId] as Address,
        chainId: assetIn.chainId,
      })

      setBlockExplorerUrl(result.blockExplorerUrl)
      setTxModalStatus('success')
      setTxModalOpen(false)

      setToast({
        visible: true,
        title: 'Swapped',
        description: `${amountIn} ${inSymbol} for ${outAmount} ${outSymbol}`,
      })

      setAmountIn('')
      setPriceQuote(null)

      trackEvent('swap_success', {
        assetIn: assetIn.asset.metadata.symbol,
        assetOut: assetOut.asset.metadata.symbol,
        amount: parseFloat(amountIn),
      })
    } catch {
      setTxModalStatus('error')
      trackEvent('swap_error', {
        assetIn: assetIn.asset.metadata.symbol,
        assetOut: assetOut.asset.metadata.symbol,
        amount: parseFloat(amountIn),
      })
    }
  }

  const handleTxModalClose = () => {
    setTxModalOpen(false)
    setTxModalStatus('loading')
    setBlockExplorerUrl(undefined)
  }

  const amountValue = parseFloat(amountIn) || 0
  const maxAmount = parseFloat(assetIn?.balance || '0')
  const isReviewDisabled =
    isExecuting ||
    !amountIn ||
    amountValue <= 0 ||
    amountValue > maxAmount ||
    !priceQuote

  const sellUsd = assetIn
    ? formatUsd(amountIn, assetIn.asset.metadata.symbol)
    : null
  const buyUsd =
    assetOut && priceQuote
      ? formatUsd(priceQuote.amountOutFormatted, assetOut.asset.metadata.symbol)
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
    <>
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
                      {displaySymbol(assetIn?.asset.metadata.symbol || 'USDC')}
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
              {assetIn && (
                <TokenButton
                  asset={assetIn}
                  onClick={() => setTokenSelectTarget('in')}
                />
              )}
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
                    isLoadingPrice
                      ? '...'
                      : priceQuote?.amountOutFormatted || ''
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
              {assetOut && (
                <TokenButton
                  asset={assetOut}
                  onClick={() => setTokenSelectTarget('out')}
                />
              )}
            </div>
          </div>
        </div>

        {/* Review Button */}
        <div className="px-6 pb-6">
          <button
            onClick={handleReview}
            disabled={isReviewDisabled}
            className="w-full py-4 px-4 font-semibold transition-all"
            style={{
              backgroundColor: isReviewDisabled ? '#D1D5DB' : '#FF0420',
              color: isReviewDisabled ? '#6B7280' : '#FFFFFF',
              fontSize: '16px',
              borderRadius: '12px',
              border: 'none',
              cursor: isReviewDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {isExecuting
              ? 'Swapping...'
              : isLoadingPrice
                ? 'Getting Quote...'
                : 'Review'}
          </button>
        </div>
      </div>

      {/* Token Select Modal */}
      <TokenSelectModal
        isOpen={tokenSelectTarget !== null}
        onClose={() => setTokenSelectTarget(null)}
        assets={assets}
        onSelect={handleTokenSelect}
      />

      {/* Review Swap Modal */}
      {assetIn && assetOut && priceQuote && (
        <ReviewSwapModal
          isOpen={reviewOpen}
          onClose={() => setReviewOpen(false)}
          onConfirm={handleConfirmSwap}
          assetIn={assetIn}
          assetOut={assetOut}
          amountIn={amountIn}
          amountOut={priceQuote.amountOutFormatted}
          priceQuote={priceQuote}
          isExecuting={isExecuting}
        />
      )}

      {/* Transaction Loading/Error Modal */}
      <TransactionModal
        isOpen={txModalOpen}
        status={txModalStatus}
        onClose={handleTxModalClose}
        blockExplorerUrl={blockExplorerUrl}
        mode="swap"
        assetSymbol={`${displaySymbol(assetIn?.asset.metadata.symbol || '')} → ${displaySymbol(assetOut?.asset.metadata.symbol || '')}`}
      />

      {/* Success Toast */}
      <Toast
        isVisible={toast.visible}
        onClose={() => setToast((t) => ({ ...t, visible: false }))}
        title={toast.title}
        description={toast.description}
      />
    </>
  )
}
