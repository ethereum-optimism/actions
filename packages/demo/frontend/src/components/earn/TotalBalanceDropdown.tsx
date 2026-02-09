import { useState, useRef, useEffect } from 'react'

interface TokenEntry {
  symbol: string
  balance: string
  logo: string
  usdValue: number
}

interface TotalBalanceDropdownProps {
  entries: TokenEntry[]
  totalUsd: number
  isLoading: boolean
}

export function TotalBalanceDropdown({
  entries,
  totalUsd,
  isLoading,
}: TotalBalanceDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const formatUsd = (value: number) =>
    `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:bg-gray-50"
        style={{
          border: '1px solid #E5E5E5',
          backgroundColor: isOpen ? '#F5F5F5' : 'transparent',
        }}
      >
        <div className="flex flex-col items-start">
          <span style={{ color: '#9195A6', fontSize: '11px', fontWeight: 400, lineHeight: '14px' }}>
            Total Balance
          </span>
          <span style={{ color: '#1a1b1e', fontSize: '14px', fontWeight: 600, lineHeight: '18px' }}>
            {isLoading ? '...' : formatUsd(totalUsd)}
          </span>
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
          className="absolute right-0 mt-2 rounded-lg shadow-lg overflow-hidden"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E5E5',
            zIndex: 50,
            width: '240px',
          }}
        >
          <div className="p-4">
            <div className="space-y-3">
              {entries.map((entry) => (
                <div key={entry.symbol} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img
                      src={entry.logo}
                      alt={entry.symbol}
                      style={{ width: '20px', height: '20px' }}
                    />
                    <span style={{ color: '#1a1b1e', fontSize: '14px', fontWeight: 500 }}>
                      {entry.balance} {entry.symbol}
                    </span>
                  </div>
                  <span style={{ color: '#1a1b1e', fontSize: '13px', fontWeight: 500 }}>
                    {formatUsd(entry.usdValue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
