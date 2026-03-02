import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Asset, SupportedChainId } from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

import type { SwapAsset } from '@/hooks/useSwapAssets'
import TransactionModal from './TransactionModal'
import Shimmer from './Shimmer'
import { Toast } from './Toast'
import { CtaButton } from './CtaButton'
import { TokenButton } from './TokenButton'
import { TokenSelectModal } from './TokenSelectModal'
import { ReviewSwapModal } from './ReviewSwapModal'
import { trackEvent } from '@/utils/analytics'
import {
  displaySymbol,
  formatSwapAmount,
  formatUsd,
  isStablecoin,
} from '@/utils/tokenDisplay'
import { useActivityHighlight } from '@/contexts/ActivityHighlightContext'
import { colors } from '@/constants/colors'

interface SwapActionProps {
  assets: SwapAsset[]
  isLoadingBalances: boolean
  onSwap: (params: {
    amountIn: number
    assetIn: Asset
    assetOut: Asset
    chainId: SupportedChainId
  }) => Promise<{
    blockExplorerUrl?: string
  }>
  onGetPrice: (params: {
    tokenInAddress: Address
    tokenOutAddress: Address
    chainId: SupportedChainId
    amountIn?: number
    amountOut?: number
  }) => Promise<{
    price: string
    priceImpact: number
    amountInFormatted: string
    amountOutFormatted: string
  } | null>
  isExecuting: boolean
  onLogActivity?: (
    action: string,
    metadata?: import('@/providers/ActivityLogProvider').ActivityMetadata,
  ) => {
    confirm: (data?: {
      blockExplorerUrl?: string
      metadata?: import('@/providers/ActivityLogProvider').ActivityMetadata
    }) => void
    error: () => void
  } | null
}

// --- Main SwapAction ---

export function SwapAction({
  assets,
  isLoadingBalances,
  onSwap,
  onGetPrice,
  isExecuting,
  onLogActivity,
}: SwapActionProps) {
  const { hoveredAction } = useActivityHighlight()
  const isSwapHighlighted = hoveredAction === 'swap'

  const [assetInIndex, setAssetInIndex] = useState(0)
  const [assetOutIndex, setAssetOutIndex] = useState(1)
  const initialized = useRef(false)

  useEffect(() => {
    if (assets.length >= 2 && !initialized.current) {
      initialized.current = true
      const usdcIdx = assets.findIndex((a) =>
        a.asset.metadata.symbol.includes('USDC'),
      )
      if (usdcIdx >= 0) {
        setAssetInIndex(usdcIdx)
        setAssetOutIndex(usdcIdx === 0 ? 1 : 0)
      }
    }
  }, [assets])

  const [amountIn, setAmountIn] = useState('')
  const [amountOut, setAmountOut] = useState('')
  const [editDirection, setEditDirection] = useState<'in' | 'out'>('in')
  const [priceQuote, setPriceQuote] = useState<{
    price: string
    priceImpact: number
    amountInFormatted: string
    amountOutFormatted: string
  } | null>(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)

  // Modal states
  const [tokenSelectTarget, setTokenSelectTarget] = useState<
    'in' | 'out' | null
  >(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [txModalOpen, setTxModalOpen] = useState(false)
  const [txModalStatus, setTxModalStatus] = useState<'loading' | 'error'>(
    'loading',
  )

  // Toast state
  const [toast, setToast] = useState<{
    visible: boolean
    title: string
    description: string
  }>({ visible: false, title: '', description: '' })

  const assetIn = assets[assetInIndex]
  const assetOut = assets[assetOutIndex]

  // Only depend on the amount the user is actively editing to avoid re-fetch loops
  const activeAmount = editDirection === 'in' ? amountIn : amountOut

  // Fetch price when amount changes (bidirectional)
  useEffect(() => {
    if (
      !activeAmount ||
      parseFloat(activeAmount) <= 0 ||
      !assetIn ||
      !assetOut
    ) {
      setPriceQuote(null)
      return
    }

    setIsLoadingPrice(true)
    const fetchPrice = async () => {
      try {
        const quote = await onGetPrice({
          tokenInAddress: assetIn.asset.address[assetIn.chainId] as Address,
          tokenOutAddress: assetOut.asset.address[assetOut.chainId] as Address,
          chainId: assetIn.chainId,
          ...(editDirection === 'in'
            ? { amountIn: parseFloat(activeAmount) }
            : { amountOut: parseFloat(activeAmount) }),
        })
        setPriceQuote(quote)
        if (quote) {
          if (editDirection === 'in') {
            setAmountOut(quote.amountOutFormatted)
          } else {
            setAmountIn(quote.amountInFormatted)
          }
        }
      } catch {
        setPriceQuote(null)
      } finally {
        setIsLoadingPrice(false)
      }
    }

    const debounce = setTimeout(fetchPrice, 500)
    return () => clearTimeout(debounce)
  }, [activeAmount, editDirection, assetIn, assetOut, onGetPrice])

  const handleFlipAssets = () => {
    setAssetInIndex(assetOutIndex)
    setAssetOutIndex(assetInIndex)
    const prevIn = amountIn
    const prevOut = amountOut
    setAmountIn(prevOut)
    setAmountOut(prevIn)
    setEditDirection('in')
    setPriceQuote(null)
  }

  const handleAmountInChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setEditDirection('in')
      setAmountIn(value)
      if (!value) setAmountOut('')
    }
  }

  const handleAmountOutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setEditDirection('out')
      setAmountOut(value)
      if (!value) setAmountIn('')
    }
  }

  const handleMaxClick = () => {
    if (assetIn) {
      setEditDirection('in')
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
      setAmountOut('')
      setPriceQuote(null)
      setEditDirection('in')
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
    const outAmount = amountOut || ''

    trackEvent('swap_initiated', {
      assetIn: assetIn.asset.metadata.symbol,
      assetOut: assetOut.asset.metadata.symbol,
      amount: parseFloat(amountIn),
    })

    const activity = onLogActivity?.('swap', {
      amount: amountIn,
      assetSymbol: assetIn.asset.metadata.symbol,
      assetLogo: assetIn.logo,
      amountOut: outAmount,
      assetOutSymbol: assetOut.asset.metadata.symbol,
      assetOutLogo: assetOut.logo,
    })

    setReviewOpen(false)
    setTxModalOpen(true)
    setTxModalStatus('loading')

    try {
      const result = await onSwap({
        amountIn: parseFloat(amountIn),
        assetIn: assetIn.asset,
        assetOut: assetOut.asset,
        chainId: assetIn.chainId,
      })

      activity?.confirm({ blockExplorerUrl: result.blockExplorerUrl })

      setTxModalOpen(false)
      setToast({
        visible: true,
        title: 'Swapped',
        description: `${amountIn} ${inSymbol} for ${outAmount} ${outSymbol}`,
      })

      setAmountIn('')
      setAmountOut('')
      setPriceQuote(null)

      trackEvent('swap_success', {
        assetIn: assetIn.asset.metadata.symbol,
        assetOut: assetOut.asset.metadata.symbol,
        amount: parseFloat(amountIn),
      })
    } catch (err) {
      console.error('[SwapAction] swap failed:', err)
      activity?.error()
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
  }

  const amountValue = parseFloat(amountIn) || 0
  const maxAmount = parseFloat(assetIn?.balance || '0')
  const isReviewDisabled =
    isExecuting ||
    !amountIn ||
    amountValue <= 0 ||
    amountValue > maxAmount ||
    !priceQuote

  // Compute USD-per-token for each side
  const sellIsStable = assetIn && isStablecoin(assetIn.asset.metadata.symbol)
  const buyIsStable = assetOut && isStablecoin(assetOut.asset.metadata.symbol)
  const parsedSellAmt = parseFloat(amountIn) || 0
  const parsedBuyAmt = parseFloat(amountOut) || 0
  const sellUsdRate = sellIsStable
    ? 1
    : buyIsStable && parsedSellAmt > 0
      ? parsedBuyAmt / parsedSellAmt
      : 1
  const buyUsdRate = buyIsStable
    ? 1
    : sellIsStable && parsedBuyAmt > 0
      ? parsedSellAmt / parsedBuyAmt
      : 1
  const sellUsd = assetIn ? formatUsd(parsedSellAmt, sellUsdRate) : null
  const buyUsd = assetOut && amountOut ? formatUsd(parsedBuyAmt, buyUsdRate) : null

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
        className="w-full transition-all"
        style={{
          backgroundColor: isSwapHighlighted
            ? colors.highlight.background
            : '#FFFFFF',
          border: `1px solid ${isSwapHighlighted ? colors.highlight.border : '#E0E2EB'}`,
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
                  value={
                    isLoadingPrice && editDirection === 'out' ? '...' : amountIn
                  }
                  onChange={handleAmountInChange}
                  disabled={isLoadingPrice && editDirection === 'out'}
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
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: '12px' }}
            >
              <span style={{ color: '#9195A6', fontSize: '14px' }}>Buy</span>
              {assetOut && (
                <span style={{ color: '#9195A6', fontSize: '14px' }}>
                  {assetOut.balance || '0'}{' '}
                  {displaySymbol(assetOut.asset.metadata.symbol)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="0"
                  value={
                    isLoadingPrice && editDirection === 'in' ? '...' : amountOut
                  }
                  onChange={handleAmountOutChange}
                  disabled={isLoadingPrice && editDirection === 'in'}
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
          <CtaButton onClick={handleReview} disabled={isReviewDisabled}>
            {isExecuting
              ? 'Swapping...'
              : isLoadingPrice
                ? 'Getting Quote...'
                : 'Review'}
          </CtaButton>
          {/* Exchange Rate */}
          {priceQuote && assetIn && assetOut && (
            <div
              style={{
                marginTop: '12px',
                fontSize: '14px',
                color: '#666666',
                fontFamily: 'Inter',
                textAlign: 'left',
              }}
            >
              1 {displaySymbol(assetIn.asset.metadata.symbol)} ={' '}
              {formatSwapAmount(priceQuote.price).main}
              {formatSwapAmount(priceQuote.price).secondary && (
                <span style={{ color: '#9195A6', fontSize: '12px' }}>
                  {formatSwapAmount(priceQuote.price).secondary}
                </span>
              )}{' '}
              {displaySymbol(assetOut.asset.metadata.symbol)}
            </div>
          )}
        </div>
      </div>

      <TokenSelectModal
        isOpen={tokenSelectTarget !== null}
        onClose={() => setTokenSelectTarget(null)}
        assets={assets}
        onSelect={handleTokenSelect}
      />

      {assetIn && assetOut && priceQuote && (
        <ReviewSwapModal
          isOpen={reviewOpen}
          onClose={() => setReviewOpen(false)}
          onConfirm={handleConfirmSwap}
          assetIn={assetIn}
          assetOut={assetOut}
          amountIn={amountIn}
          amountOut={amountOut}
          priceQuote={priceQuote}
          isExecuting={isExecuting}
        />
      )}

      <TransactionModal
        isOpen={txModalOpen}
        status={txModalStatus}
        onClose={handleTxModalClose}
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
    </>
  )
}
