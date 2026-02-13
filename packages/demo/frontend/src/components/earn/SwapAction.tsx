import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Asset, SupportedChainId } from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

import { Modal } from '../Modal'
import TransactionModal from './TransactionModal'
import Shimmer from './Shimmer'
import { Toast } from './Toast'
import { CtaButton } from './CtaButton'
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

function formatUsd(amount: string, usdPerToken = 1): string | null {
  const parsed = parseFloat(amount)
  if (!parsed || parsed <= 0) return null
  return `$${(parsed * usdPerToken).toFixed(2)}`
}

function isStablecoin(symbol: string): boolean {
  return displaySymbol(symbol).toUpperCase() === 'USDC'
}

function formatSwapAmount(amount: string): { main: string; secondary: string } {
  const num = parseFloat(amount)
  if (isNaN(num) || num === 0) return { main: '0', secondary: '' }

  const [whole, decimal = ''] = amount.split('.')
  if (decimal.length <= 4) return { main: amount, secondary: '' }

  return {
    main: `${whole}.${decimal.substring(0, 4)}`,
    secondary: decimal.substring(4),
  }
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
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="420px">
      <div style={{ margin: '-24px' }}>
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
            const usdValue = isStablecoin(asset.asset.metadata.symbol)
              ? `$${parseFloat(balance).toFixed(2)}`
              : null

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
                    {usdValue ?? balance}
                  </div>
                  {usdValue && (
                    <div style={{ fontSize: '14px', color: '#9195A6' }}>
                      {balance}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
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
  const symbolIn = displaySymbol(assetIn.asset.metadata.symbol)
  const symbolOut = displaySymbol(assetOut.asset.metadata.symbol)

  // Compute USD values: stablecoins are 1:1, others derived from the USDC side
  const inIsStable = isStablecoin(assetIn.asset.metadata.symbol)
  const outIsStable = isStablecoin(assetOut.asset.metadata.symbol)
  const parsedIn = parseFloat(amountIn) || 0
  const parsedOut = parseFloat(amountOut) || 0
  const usdPerIn = inIsStable
    ? 1
    : outIsStable && parsedIn > 0
      ? parsedOut / parsedIn
      : 1
  const usdPerOut = outIsStable
    ? 1
    : inIsStable && parsedOut > 0
      ? parsedIn / parsedOut
      : 1
  const usdIn = formatUsd(amountIn, usdPerIn)

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="420px">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
        }}
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '32px', fontWeight: 500, color: '#1a1b1e' }}>
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
        <span style={{ fontSize: '14px', color: '#9195A6' }}>You receive</span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '32px', fontWeight: 500, color: '#1a1b1e' }}>
            {formatSwapAmount(amountOut).main}
            {formatSwapAmount(amountOut).secondary && (
              <span style={{ color: '#9195A6', fontSize: '20px' }}>
                {formatSwapAmount(amountOut).secondary}
              </span>
            )}
          </span>
          <img
            src={assetOut.logo}
            alt={symbolOut}
            style={{ width: '32px', height: '32px', borderRadius: '50%' }}
          />
        </div>
        {formatUsd(amountOut, usdPerOut) && (
          <span style={{ fontSize: '14px', color: '#9195A6' }}>
            {formatUsd(amountOut, usdPerOut)}
          </span>
        )}
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
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#666666' }}>Exchange rate</span>
            <span style={{ color: '#1a1b1e' }}>
              1 {symbolIn} = {formatSwapAmount(priceQuote.price).main}
              {formatSwapAmount(priceQuote.price).secondary && (
                <span style={{ color: '#9195A6', fontSize: '12px' }}>
                  {formatSwapAmount(priceQuote.price).secondary}
                </span>
              )}{' '}
              {symbolOut}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#666666' }}>Minimum received</span>
            <span style={{ color: '#1a1b1e' }}>
              {
                formatSwapAmount((parseFloat(amountOut) * 0.995).toFixed(6))
                  .main
              }
              {formatSwapAmount((parseFloat(amountOut) * 0.995).toFixed(6))
                .secondary && (
                <span style={{ color: '#9195A6', fontSize: '12px' }}>
                  {
                    formatSwapAmount((parseFloat(amountOut) * 0.995).toFixed(6))
                      .secondary
                  }
                </span>
              )}{' '}
              {symbolOut}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#666666' }}>Max slippage</span>
            <span style={{ color: '#1a1b1e' }}>0.5%</span>
          </div>
        </div>
      )}

      {/* Swap button */}
      <CtaButton onClick={onConfirm} disabled={isExecuting}>
        {isExecuting ? 'Swapping...' : 'Swap'}
      </CtaButton>
    </Modal>
  )
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
  const sellUsd = assetIn ? formatUsd(amountIn, sellUsdRate) : null
  const buyUsd = assetOut && amountOut ? formatUsd(amountOut, buyUsdRate) : null

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
        mode="swap"
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
