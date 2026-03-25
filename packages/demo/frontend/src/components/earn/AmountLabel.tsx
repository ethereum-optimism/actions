import Shimmer from './Shimmer'
import { MaxButton } from './CtaButton'

function floorToFixed(value: number, decimals: number): string {
  const factor = 10 ** decimals
  return (Math.floor(value * factor) / factor).toFixed(decimals)
}

export function AmountLabel({
  mode,
  isLoadingBalance,
  isLockedWithdrawAmount,
  assetBalance,
  depositedAmount,
  displaySymbol,
  displayPrecision,
  onMaxClick,
}: {
  mode: 'lend' | 'withdraw'
  isLoadingBalance: boolean
  isLockedWithdrawAmount: boolean
  assetBalance: string
  depositedAmount: string | null
  displaySymbol: string
  displayPrecision: number
  onMaxClick: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
      }}
    >
      <label
        style={{
          color: '#0F111A',
          fontSize: '16px',
          fontWeight: 600,
          display: 'block',
        }}
      >
        {mode === 'lend' ? 'Amount to lend' : 'Amount to withdraw'}
      </label>
      {!isLockedWithdrawAmount && (
        <div className="flex items-center gap-1">
          {isLoadingBalance ? (
            <Shimmer width="80px" height="16px" variant="rectangle" />
          ) : (
            <>
              <span style={{ color: '#9195A6', fontSize: '14px' }}>
                {mode === 'lend'
                  ? `${floorToFixed(parseFloat(assetBalance), displayPrecision)} ${displaySymbol}`
                  : `${floorToFixed(parseFloat(depositedAmount || '0'), displayPrecision)} ${displaySymbol}`}
              </span>
              <MaxButton onClick={onMaxClick} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
