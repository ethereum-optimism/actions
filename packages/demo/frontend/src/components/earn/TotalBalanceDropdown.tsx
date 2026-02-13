import { useState, useRef, useEffect } from 'react'
import type { TokenBalanceRow } from '@/hooks/useTotalBalance'

interface TotalBalanceDropdownProps {
  totalUsd: number
  tokenBalances: TokenBalanceRow[]
  isLoading: boolean
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`
}

/**
 * Format a balance with up to 4 decimal places.
 * First 2 decimals are normal, remaining are smaller and gray.
 * If all decimals are zero, show as integer.
 */
function FormattedBalance({
  value,
  symbol,
}: {
  value: number
  symbol: string
}) {
  // Round to 4 decimals
  const rounded = Math.round(value * 10000) / 10000
  const str = rounded.toFixed(4)
  const [intPart, decPart] = str.split('.')

  // If all decimals are zero, show integer
  if (decPart === '0000') {
    return (
      <>
        {intPart} {symbol}
      </>
    )
  }

  const first2 = decPart.slice(0, 2)
  const rest = decPart.slice(2)

  // If trailing decimals are zero, only show first 2
  if (rest === '00') {
    return (
      <>
        {intPart}.{first2} {symbol}
      </>
    )
  }

  return (
    <>
      {intPart}.{first2}
      <span style={{ color: '#9195A6', fontSize: '12px' }}>{rest}</span>{' '}
      {symbol}
    </>
  )
}

export function TotalBalanceDropdown({
  totalUsd,
  tokenBalances,
  isLoading,
}: TotalBalanceDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 12px',
          border: '1px solid #E5E5E5',
          borderRadius: '8px',
          backgroundColor: isOpen ? '#F5F5F5' : 'transparent',
          cursor: 'pointer',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          transition: 'background-color 0.15s',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div
            style={{ fontSize: '11px', color: '#9195A6', lineHeight: '14px' }}
          >
            Total Balance
          </div>
          <div
            style={{
              fontSize: '14px',
              color: '#1a1b1e',
              lineHeight: '18px',
            }}
          >
            {isLoading ? '...' : formatUsd(totalUsd)}
          </div>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#666666"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.15s',
          }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: '240px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E0E2EB',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            padding: '8px',
            zIndex: 50,
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          {tokenBalances.map((token) => (
            <div
              key={token.symbol}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: '8px',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
              >
                <img
                  src={token.logo}
                  alt={token.symbol}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                  }}
                />
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 500,
                    color: '#1a1b1e',
                  }}
                >
                  <FormattedBalance
                    value={token.balance}
                    symbol={token.symbol}
                  />
                </span>
              </div>
              <span
                style={{
                  fontSize: '15px',
                  color: '#666666',
                }}
              >
                {formatUsd(token.usdValue)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
