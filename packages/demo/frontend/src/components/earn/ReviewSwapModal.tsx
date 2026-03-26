import type { SwapAsset } from '@/hooks/useSwapAssets'
import { MARKET_LOGO } from '@/constants/logos'
import { getProviderDisplayName } from '@/constants/providers'
import {
  deriveUsdRates,
  displaySymbol,
  formatSwapAmount,
  formatUsd,
} from '@/utils/tokenDisplay'

import { Modal, ModalHeader } from '../Modal'
import { CtaButton } from './CtaButton'

function AmountRow({
  label,
  amount,
  logo,
  symbol,
  usd,
}: {
  label: string
  amount: { main: string; secondary?: string }
  logo: string
  symbol: string
  usd?: string | null
}) {
  return (
    <div>
      <span style={{ fontSize: '14px', color: '#9195A6' }}>{label}</span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '32px', fontWeight: 500, color: '#1a1b1e' }}>
          {amount.main}
          {amount.secondary && (
            <span style={{ color: '#9195A6', fontSize: '20px' }}>
              {amount.secondary}
            </span>
          )}
        </span>
        <img
          src={logo}
          alt={symbol}
          style={{ width: '32px', height: '32px', borderRadius: '50%' }}
        />
      </div>
      {usd && <span style={{ fontSize: '14px', color: '#9195A6' }}>{usd}</span>}
    </div>
  )
}

function DownArrow() {
  return (
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
  )
}

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string
  value: React.ReactNode
  valueColor?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#666666' }}>{label}</span>
      <span style={{ color: valueColor || '#1a1b1e' }}>{value}</span>
    </div>
  )
}

function FormattedAmount({
  amount,
  suffix,
}: {
  amount: { main: string; secondary?: string }
  suffix: string
}) {
  return (
    <>
      {amount.main}
      {amount.secondary && (
        <span style={{ color: '#9195A6', fontSize: '12px' }}>
          {amount.secondary}
        </span>
      )}{' '}
      {suffix}
    </>
  )
}

function SwapDetails({
  priceQuote,
  symbolIn,
  symbolOut,
  formattedMinReceived,
  slippage,
  selectedProvider,
  chainId,
}: {
  priceQuote: { price: number; priceImpact: number }
  symbolIn: string
  symbolOut: string
  formattedMinReceived: { main: string; secondary?: string }
  slippage: number
  selectedProvider?: string | null
  chainId?: number
}) {
  const formattedRate = formatSwapAmount(priceQuote.price)
  const impactPct = (priceQuote.priceImpact * 100).toFixed(3)
  const providerDisplayName = selectedProvider
    ? getProviderDisplayName(selectedProvider, chainId)
    : ''

  return (
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
      {selectedProvider && (
        <DetailRow
          label="Swap provider"
          value={
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {MARKET_LOGO[providerDisplayName] && (
                <img
                  src={MARKET_LOGO[providerDisplayName]}
                  alt={providerDisplayName}
                  style={{ width: '16px', height: '16px' }}
                />
              )}
              {providerDisplayName}
            </span>
          }
        />
      )}
      <DetailRow
        label="Exchange rate"
        value={
          <>
            1 {symbolIn} ={' '}
            <FormattedAmount amount={formattedRate} suffix={symbolOut} />
          </>
        }
      />
      <DetailRow
        label="Price impact"
        value={`${priceQuote.priceImpact > 0 ? '-' : ''}${impactPct}%`}
        valueColor={priceQuote.priceImpact > 0.01 ? '#F59E0B' : undefined}
      />
      <DetailRow
        label="Minimum received"
        value={
          <FormattedAmount amount={formattedMinReceived} suffix={symbolOut} />
        }
      />
      <DetailRow
        label="Max slippage"
        value={`${(slippage * 100).toFixed(1)}%`}
      />
    </div>
  )
}

interface ReviewSwapModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  assetIn: SwapAsset
  assetOut: SwapAsset
  amountIn: string
  amountOut: string
  priceQuote: { price: number; priceImpact: number } | null
  isExecuting: boolean
  selectedProvider?: string | null
  slippage?: number
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
  selectedProvider,
  slippage = 0.005,
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

  const formattedMinReceived = formatSwapAmount(
    (parsedOut * (1 - slippage)).toFixed(6),
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="420px">
      <ModalHeader title="Review swap" onClose={onClose} />

      <AmountRow
        label="You pay"
        amount={formatSwapAmount(amountIn)}
        logo={assetIn.logo}
        symbol={symbolIn}
        usd={formatUsd(parsedIn, usdPerIn)}
      />

      <DownArrow />

      <div style={{ marginBottom: '24px' }}>
        <AmountRow
          label="You receive"
          amount={formatSwapAmount(amountOut)}
          logo={assetOut.logo}
          symbol={symbolOut}
          usd={formatUsd(parsedOut, usdPerOut)}
        />
      </div>

      {priceQuote && (
        <SwapDetails
          priceQuote={priceQuote}
          symbolIn={symbolIn}
          symbolOut={symbolOut}
          formattedMinReceived={formattedMinReceived}
          slippage={slippage}
          selectedProvider={selectedProvider}
          chainId={assetIn.chainId}
        />
      )}

      <CtaButton onClick={onConfirm} disabled={isExecuting}>
        {isExecuting ? 'Swapping...' : 'Swap'}
      </CtaButton>
    </Modal>
  )
}
