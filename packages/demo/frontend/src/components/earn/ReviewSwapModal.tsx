import type { SwapAsset } from '@/hooks/useSwapAssets'
import {
  deriveUsdRates,
  displaySymbol,
  formatSwapAmount,
  formatUsd,
} from '@/utils/tokenDisplay'

import { Modal, ModalHeader } from '../Modal'
import { CtaButton } from './CtaButton'

interface ReviewSwapModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  assetIn: SwapAsset
  assetOut: SwapAsset
  amountIn: string
  amountOut: string
  priceQuote: { price: string; priceImpact: number } | null
  isExecuting: boolean
}

export function ReviewSwapModal({
  isOpen,
  onClose,
  onConfirm,
  assetIn,
  assetOut,
  amountIn,
  amountOut,
  priceQuote,
  isExecuting,
}: ReviewSwapModalProps) {
  const symbolIn = displaySymbol(assetIn.asset.metadata.symbol)
  const symbolOut = displaySymbol(assetOut.asset.metadata.symbol)

  const parsedIn = parseFloat(amountIn) || 0
  const parsedOut = parseFloat(amountOut) || 0
  const { usdPerIn, usdPerOut } = deriveUsdRates(
    assetIn.asset.metadata.symbol,
    assetOut.asset.metadata.symbol,
    parsedIn,
    parsedOut,
  )
  const usdIn = formatUsd(parsedIn, usdPerIn)

  const formattedOut = formatSwapAmount(amountOut)
  const formattedMinReceived = formatSwapAmount(
    (parsedOut * 0.995).toFixed(6),
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="420px">
      <ModalHeader title="Review swap" onClose={onClose} />

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
            {formattedOut.main}
            {formattedOut.secondary && (
              <span style={{ color: '#9195A6', fontSize: '20px' }}>
                {formattedOut.secondary}
              </span>
            )}
          </span>
          <img
            src={assetOut.logo}
            alt={symbolOut}
            style={{ width: '32px', height: '32px', borderRadius: '50%' }}
          />
        </div>
        {formatUsd(parsedOut, usdPerOut) && (
          <span style={{ fontSize: '14px', color: '#9195A6' }}>
            {formatUsd(parsedOut, usdPerOut)}
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
              {formattedMinReceived.main}
              {formattedMinReceived.secondary && (
                <span style={{ color: '#9195A6', fontSize: '12px' }}>
                  {formattedMinReceived.secondary}
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

      <CtaButton onClick={onConfirm} disabled={isExecuting}>
        {isExecuting ? 'Swapping...' : 'Swap'}
      </CtaButton>
    </Modal>
  )
}
