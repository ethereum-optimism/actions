import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Asset, SupportedChainId } from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

import type { SwapAsset } from '@/hooks/useSwapAssets'
import TransactionModal from './TransactionModal'
import Shimmer from './Shimmer'
import { Toast } from './Toast'
import { CtaButton, MaxButton } from './CtaButton'
import { TokenButton } from './TokenButton'
import { TokenSelectModal } from './TokenSelectModal'
import { ReviewSwapModal } from './ReviewSwapModal'
import { trackEvent } from '@/utils/analytics'
import {
  deriveUsdRates,
  displaySymbol,
  formatSwapAmount,
  formatUsd,
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
    amountIn: number
    amountOut: number
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

const amountInputStyle = {
  width: '100%',
  border: 'none',
  outline: 'none',
  fontSize: '32px',
  fontWeight: 500,
  color: '#000',
  backgroundColor: 'transparent',
  fontFamily: 'Inter',
} as const

function SwapInputPanel({
  label,
  asset,
  amount,
  usd,
  isLoading,
  isLoadingBalances,
  onChange,
  onTokenClick,
  onMaxClick,
  dashed,
}: {
  label: string
  asset: SwapAsset | undefined
  amount: string
  usd: string | null
  isLoading: boolean
  isLoadingBalances: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onTokenClick: () => void
  onMaxClick?: () => void
  dashed?: boolean
}) {
  return (
    <div
      style={{
        backgroundColor: '#F9FAFB',
        borderRadius: '16px',
        padding: '20px',
        ...(dashed && { border: '1px dashed #E0E2EB' }),
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span style={{ color: '#9195A6', fontSize: '14px' }}>{label}</span>
        <div className="flex items-center gap-1">
          {isLoadingBalances ? (
            <Shimmer width="80px" height="16px" variant="rectangle" />
          ) : (
            <>
              <span style={{ color: '#9195A6', fontSize: '14px' }}>
                {asset?.balance || '0'}{' '}
                {displaySymbol(asset?.asset.metadata.symbol || '')}
              </span>
              {onMaxClick && <MaxButton onClick={onMaxClick} />}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div style={{ flex: 1 }}>
          <input
            type="text"
            placeholder="0"
            value={isLoading ? '...' : amount}
            onChange={onChange}
            disabled={isLoading}
            style={amountInputStyle}
          />
          {usd && (
            <span
              style={{
                color: '#9195A6',
                fontSize: '14px',
                marginTop: '2px',
                display: 'block',
              }}
            >
              {usd}
            </span>
          )}
        </div>
        {asset && <TokenButton asset={asset} onClick={onTokenClick} />}
      </div>
    </div>
  )
}

function FlipButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-center -my-3 relative z-10">
      <button
        onClick={onClick}
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
  )
}

function ExchangeRate({
  assetIn,
  assetOut,
  formattedPrice,
}: {
  assetIn: SwapAsset
  assetOut: SwapAsset
  formattedPrice: { main: string; secondary?: string }
}) {
  return (
    <div
      style={{
        marginTop: '12px',
        fontSize: '14px',
        color: '#666666',
        fontFamily: 'Inter',
        textAlign: 'left',
      }}
    >
      1 {displaySymbol(assetIn.asset.metadata.symbol)} = {formattedPrice.main}
      {formattedPrice.secondary && (
        <span style={{ color: '#9195A6', fontSize: '12px' }}>
          {formattedPrice.secondary}
        </span>
      )}{' '}
      {displaySymbol(assetOut.asset.metadata.symbol)}
    </div>
  )
}

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
    amountIn: number
    amountOut: number
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

  // Stable identity for price fetch dependencies — avoid re-fetching when balance changes
  const tokenInAddress = assetIn?.asset.address[assetIn?.chainId] as
    | Address
    | undefined
  const tokenOutAddress = assetOut?.asset.address[assetOut?.chainId] as
    | Address
    | undefined
  const chainId = assetIn?.chainId

  // Fetch price when amount or asset selection changes (not on balance updates)
  useEffect(() => {
    if (
      !activeAmount ||
      parseFloat(activeAmount) <= 0 ||
      !tokenInAddress ||
      !tokenOutAddress ||
      !chainId
    ) {
      setPriceQuote(null)
      return
    }

    setIsLoadingPrice(true)
    const fetchPrice = async () => {
      const activity = onLogActivity?.('getPrice')
      try {
        const quote = await onGetPrice({
          tokenInAddress,
          tokenOutAddress,
          chainId,
          ...(editDirection === 'in'
            ? { amountIn: parseFloat(activeAmount) }
            : { amountOut: parseFloat(activeAmount) }),
        })
        activity?.confirm()
        setPriceQuote(quote)
        if (quote) {
          if (editDirection === 'in') {
            setAmountOut(quote.amountOut.toString())
          } else {
            setAmountIn(quote.amountIn.toString())
          }
        }
      } catch {
        activity?.confirm({ error: 'Failed to fetch price' })
        setPriceQuote(null)
      } finally {
        setIsLoadingPrice(false)
      }
    }

    const debounce = setTimeout(fetchPrice, 500)
    return () => clearTimeout(debounce)
  }, [
    activeAmount,
    editDirection,
    tokenInAddress,
    tokenOutAddress,
    chainId,
    onGetPrice,
    onLogActivity,
  ])

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
      chainId: assetIn.chainId,
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
    } catch {
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
  const parsedSellAmt = parseFloat(amountIn) || 0
  const parsedBuyAmt = parseFloat(amountOut) || 0
  const { usdPerIn: sellUsdRate, usdPerOut: buyUsdRate } = deriveUsdRates(
    assetIn?.asset.metadata.symbol ?? '',
    assetOut?.asset.metadata.symbol ?? '',
    parsedSellAmt,
    parsedBuyAmt,
  )
  const sellUsd = assetIn ? formatUsd(parsedSellAmt, sellUsdRate) : null
  const buyUsd =
    assetOut && amountOut ? formatUsd(parsedBuyAmt, buyUsdRate) : null

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

  const formattedPrice = priceQuote ? formatSwapAmount(priceQuote.price) : null

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
        <div className="p-6">
          <SwapInputPanel
            label="Sell"
            asset={assetIn}
            amount={amountIn}
            usd={sellUsd}
            isLoading={isLoadingPrice && editDirection === 'out'}
            isLoadingBalances={isLoadingBalances}
            onChange={handleAmountInChange}
            onTokenClick={() => setTokenSelectTarget('in')}
            onMaxClick={handleMaxClick}
          />
        </div>

        <FlipButton onClick={handleFlipAssets} />

        <div className="p-6" style={{ borderTop: '1px solid #E0E2EB' }}>
          <SwapInputPanel
            label="Buy"
            asset={assetOut}
            amount={amountOut}
            usd={buyUsd}
            isLoading={isLoadingPrice && editDirection === 'in'}
            isLoadingBalances={isLoadingBalances}
            onChange={handleAmountOutChange}
            onTokenClick={() => setTokenSelectTarget('out')}
            dashed
          />
        </div>

        <div className="px-6 pb-6">
          <CtaButton onClick={handleReview} disabled={isReviewDisabled}>
            {isExecuting
              ? 'Swapping...'
              : isLoadingPrice
                ? 'Getting Quote...'
                : 'Review'}
          </CtaButton>
          {priceQuote && assetIn && assetOut && formattedPrice && (
            <ExchangeRate
              assetIn={assetIn}
              assetOut={assetOut}
              formattedPrice={formattedPrice}
            />
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
