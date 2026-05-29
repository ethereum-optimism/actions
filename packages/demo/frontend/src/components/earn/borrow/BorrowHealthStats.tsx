/**
 * Stats beneath the health bar: the canonical Aave-style health factor
 * plus the Liquidation / Buffer / Borrow APY / Collateral rows.
 */

import type { Asset } from '@eth-optimism/actions-sdk'
import { InfoTooltip } from '../InfoTooltip'

export function BorrowHealthStats({
  maxLtv,
  bufferPct,
  borrowApy,
  collateralAsset,
  collateralValueUsd,
  projectedHealthFactor,
}: {
  maxLtv: number
  bufferPct: number
  borrowApy: number
  collateralAsset: Asset
  collateralValueUsd: number
  projectedHealthFactor: number
}) {
  return (
    <>
      {/* Canonical Aave-style HF (secondary label) */}
      <div style={{ color: '#9195A6', fontSize: '12px', fontFamily: 'Inter' }}>
        Health Factor:{' '}
        {Number.isFinite(projectedHealthFactor)
          ? projectedHealthFactor.toFixed(2)
          : '∞'}
      </div>

      <DetailRow
        label="Liquidation at"
        value={`${(maxLtv * 100).toFixed(1)}%`}
      />
      <DetailRow
        label="Buffer"
        value={`${(bufferPct * 100).toFixed(0)}%`}
        info="Safety margin below liquidation. Max borrow stops here, not at the limit, to leave room for price moves and interest."
      />
      <DetailRow
        label="Borrow APY"
        value={`${(borrowApy * 100).toFixed(2)}%`}
      />
      <DetailRow
        label="Collateral"
        value={
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ color: '#9195A6', fontSize: '13px' }}>
              {collateralAsset.metadata.symbol.replace('_DEMO', '')}
            </span>
            <span style={{ color: '#1a1b1e' }}>
              ${collateralValueUsd.toFixed(2)}
            </span>
          </span>
        }
      />
    </>
  )
}

function DetailRow({
  label,
  value,
  info,
}: {
  label: string
  value: React.ReactNode
  info?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span
        style={{
          color: '#666666',
          fontSize: '13px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {label}
        {info && <InfoTooltip text={info} />}
      </span>
      <span style={{ color: '#1a1b1e', fontSize: '13px' }}>{value}</span>
    </div>
  )
}
