import { useEffect, useRef, useState } from 'react'

import { MARKET_LOGO } from '@/constants/logos'

const PROVIDERS = ['Uniswap', 'Velodrome'] as const
const REFRESH_INTERVAL = 10_000

/**
 * Simulates periodic price fetching across swap providers and displays
 * the "best price" result. On testnet both providers return the same price,
 * so this alternates to demonstrate the routing behavior.
 *
 * In production, the SDK's routing.strategy = 'price' will perform real
 * comparisons and automatically select the best provider.
 */
export function BestPriceIndicator() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFetching, setIsFetching] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_INTERVAL / 1000)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const countdown = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsFetching(true)
          setTimeout(() => {
            setCurrentIndex((i) => (i + 1) % PROVIDERS.length)
            setIsFetching(false)
          }, 600)
          return REFRESH_INTERVAL / 1000
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(countdown)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        setShowTooltip(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const bestProvider = PROVIDERS[currentIndex]
  const logo = MARKET_LOGO[bestProvider]

  return (
    <div
      className="flex items-center justify-between px-4 py-3 mt-3"
      style={{
        border: '1px solid #E0E2EB',
        borderRadius: '12px',
        backgroundColor: '#FAFAFA',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: '#666666' }}>
          Best price:
        </span>
        {isFetching ? (
          <span className="text-xs font-medium" style={{ color: '#999999' }}>
            Fetching...
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            {logo && <img src={logo} alt={bestProvider} className="h-4 w-4" />}
            <span className="text-xs font-medium" style={{ color: '#1a1b1e' }}>
              {bestProvider}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs tabular-nums" style={{ color: '#999999' }}>
          {isFetching ? '...' : `${secondsLeft}s`}
        </span>
        <div className="relative" ref={tooltipRef}>
          <button
            onClick={() => setShowTooltip((prev) => !prev)}
            className="flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            style={{ width: '20px', height: '20px' }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#999999"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </button>

          {showTooltip && (
            <div
              className="absolute right-0 bottom-full mb-2 p-3 shadow-lg"
              style={{
                backgroundColor: '#1a1b1e',
                borderRadius: '8px',
                width: '280px',
                zIndex: 50,
              }}
            >
              <p
                className="text-xs leading-relaxed"
                style={{ color: '#E0E2EB' }}
              >
                <strong style={{ color: '#FFFFFF' }}>
                  Simulated for testnet.
                </strong>{' '}
                In production, the SDK automatically fetches prices from all
                configured providers and selects the best one via{' '}
                <code
                  style={{
                    backgroundColor: '#2a2b2e',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    fontSize: '11px',
                  }}
                >
                  routing.strategy: &apos;price&apos;
                </code>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
