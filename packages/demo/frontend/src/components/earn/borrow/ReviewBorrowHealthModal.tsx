/**
 * Review modal for borrow / repay / withdraw-with-collateral flows.
 *
 * Composes `Modal` + the shared `reviewModalParts` (AmountRow, DetailRow,
 * FormattedAmount) + `<BorrowHealthCard>` with the projection baked in.
 * Surfaces a warning section when the projected tier lands in danger or
 * buffer zones. Confirm fires `onConfirm` (the caller's mutation).
 *
 * `flow` discriminator is baked in from Phase 3 to avoid the two-rewrite
 * trap if the modal grew per-flow over time. `'withdraw'` is the
 * Lend-tab-withdraw-with-pledged-collateral case, used in Phase 5.
 */

import { Modal, ModalHeader } from '../../Modal'
import { CtaButton } from '../CtaButton'
import { BorrowHealthCard } from './BorrowHealthCard'
import { AmountRow, DetailRow, FormattedAmount } from '../reviewModalParts'
import { getAssetLogo } from '@/constants/logos'
import type { Asset } from '@eth-optimism/actions-sdk'

export type BorrowFlow = 'borrow' | 'repay' | 'withdraw'

export interface ReviewBorrowHealthModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  isExecuting: boolean
  flow: BorrowFlow

  /** Amount the user is acting on (borrow / repay / withdraw amount). */
  amount: { main: string; secondary?: string }
  amountUsd: string | null
  asset: Asset

  /** Projection state passed to the embedded <BorrowHealthCard>. */
  currentLtv: number
  projectedLtv: number
  maxLtv: number
  bufferPct: number
  borrowApy: number
  collateralAsset: Asset
  collateralValueUsd: number
  projectedHealthFactor: number
  wouldLiquidate?: boolean
}

const TITLES: Record<BorrowFlow, string> = {
  borrow: 'Review borrow',
  repay: 'Review repay',
  withdraw: 'Review withdraw',
}

const CTA_LABELS: Record<BorrowFlow, string> = {
  borrow: 'Borrow',
  repay: 'Repay',
  withdraw: 'Withdraw',
}

const WARNING_COPY: Record<BorrowFlow, string> = {
  borrow:
    'This borrow moves your position into the buffer zone. If collateral price drops, you may be liquidated.',
  repay:
    'Position remains close to liquidation after this repay. Consider repaying more.',
  withdraw:
    'Withdrawing this amount moves your position into the buffer zone. If collateral price drops, you may be liquidated.',
}

export function ReviewBorrowHealthModal({
  isOpen,
  onClose,
  onConfirm,
  isExecuting,
  flow,
  amount,
  amountUsd,
  asset,
  currentLtv,
  projectedLtv,
  maxLtv,
  bufferPct,
  borrowApy,
  collateralAsset,
  collateralValueUsd,
  projectedHealthFactor,
  wouldLiquidate = false,
}: ReviewBorrowHealthModalProps) {
  const symbol = asset.metadata.symbol.replace('_DEMO', '')
  const assetLogo = getAssetLogo(asset.metadata.symbol)

  const isDanger =
    !wouldLiquidate &&
    projectedHealthFactor !== Infinity &&
    projectedHealthFactor < 1.2

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="440px">
      <ModalHeader title={TITLES[flow]} onClose={onClose} />

      <AmountRow
        label={
          flow === 'borrow'
            ? 'You borrow'
            : flow === 'repay'
              ? 'You repay'
              : 'You withdraw'
        }
        amount={amount}
        logo={assetLogo}
        symbol={symbol}
        usd={amountUsd}
      />

      <div style={{ height: '16px' }} />

      <BorrowHealthCard
        currentLtv={currentLtv}
        projectedLtv={projectedLtv}
        maxLtv={maxLtv}
        bufferPct={bufferPct}
        borrowApy={borrowApy}
        collateralAsset={collateralAsset}
        collateralValueUsd={collateralValueUsd}
        projectedHealthFactor={projectedHealthFactor}
        wouldLiquidate={wouldLiquidate}
      />

      {(wouldLiquidate || isDanger) && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px 14px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '10px',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
          }}
        >
          <WarningIcon />
          <span
            style={{
              color: '#B91C1C',
              fontSize: '13px',
              lineHeight: '18px',
              fontFamily: 'Inter',
            }}
          >
            {wouldLiquidate
              ? 'This action would liquidate your position. The transaction will fail or your collateral will be seized.'
              : WARNING_COPY[flow]}
          </span>
        </div>
      )}

      <div style={{ height: '20px' }} />

      <FeeDetail label="Borrow APY">
        <FormattedAmount
          amount={{ main: (borrowApy * 100).toFixed(2) }}
          suffix="%"
        />
      </FeeDetail>

      <div style={{ height: '20px' }} />

      <CtaButton onClick={onConfirm} disabled={isExecuting || wouldLiquidate}>
        {isExecuting ? 'Submitting...' : CTA_LABELS[flow]}
      </CtaButton>
    </Modal>
  )
}

function FeeDetail({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <DetailRow
      label={label}
      value={
        <span style={{ fontSize: '14px', fontFamily: 'Inter' }}>
          {children}
        </span>
      }
    />
  )
}

function WarningIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M10 2.5L18 17H2L10 2.5Z"
        stroke="#B91C1C"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10 8V12M10 14.5V15"
        stroke="#B91C1C"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
