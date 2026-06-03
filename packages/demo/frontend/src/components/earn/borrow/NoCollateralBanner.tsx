/**
 * Empty-state banner shown on the Borrow tab when the user has no lend
 * position to pledge as collateral.
 */

import InfoIcon from '@/components/icons/InfoIcon'

export function NoCollateralBanner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        backgroundColor: '#F5F5F7',
        border: '1px solid #E0E2EB',
        borderRadius: '12px',
        color: '#1a1b1e',
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <InfoIcon
        width={20}
        height={20}
        strokeWidth={1.5}
        style={{ flexShrink: 0 }}
      />
      <span>To borrow you need to lend any asset to be used as collateral</span>
    </div>
  )
}
