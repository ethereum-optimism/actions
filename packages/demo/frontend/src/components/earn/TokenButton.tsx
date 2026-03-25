import type { SwapAsset } from '@/hooks/useSwapAssets'
import { displaySymbol } from '@/utils/tokenDisplay'

export function TokenButton({
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
