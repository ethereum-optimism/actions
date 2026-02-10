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
        className="flex items-center gap-2 rounded-lg transition-all hover:bg-gray-50"
        style={{
          padding: '4px 12px',
          border: '1px solid #E5E5E5',
          backgroundColor: isOpen ? '#F5F5F5' : 'transparent',
          cursor: 'pointer',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
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
          className="w-4 h-4 transition-transform"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
            color: '#666666',
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
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
              className="flex items-center justify-between"
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
              }}
            >
              <div className="flex items-center gap-3">
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
                  {token.balance} {token.symbol}
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
