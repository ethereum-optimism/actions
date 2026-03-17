import { useEffect, useMemo, useRef, useState } from 'react'
import type { SwapMarket } from '@eth-optimism/actions-sdk/react'

import { CHAIN_DISPLAY, DEFAULT_CHAIN, MARKET_LOGO } from '@/constants/logos'

/** Capitalize first letter */
const displayName = (provider: string) =>
  provider.charAt(0).toUpperCase() + provider.slice(1)

interface SwapMarketSelectorProps {
  markets: SwapMarket[]
  selectedProvider: string | null
  onSelect: (provider: string) => void
  isLoading?: boolean
}

export function SwapMarketSelector({
  markets,
  selectedProvider,
  onSelect,
  isLoading = false,
}: SwapMarketSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Derive unique providers from the markets list
  const providerOptions = useMemo(() => {
    const seen = new Map<string, { provider: string; chainId: number }>()
    for (const market of markets) {
      if (!seen.has(market.provider)) {
        seen.set(market.provider, {
          provider: market.provider,
          chainId: market.marketId.chainId,
        })
      }
    }
    return Array.from(seen.values())
  }, [markets])

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

  const handleClick = (provider: string) => {
    onSelect(provider)
    setIsOpen(false)
  }

  const chainDisplay = (chainId: number) =>
    CHAIN_DISPLAY[chainId] ?? DEFAULT_CHAIN

  const renderOption = (option: { provider: string; chainId: number }) => {
    const chain = chainDisplay(option.chainId)
    const name = displayName(option.provider)
    return (
      <div className="flex items-center gap-2 flex-1">
        <img src={MARKET_LOGO[name] ?? ''} alt={name} className="h-6 w-6" />
        <span className="text-sm font-medium" style={{ color: '#1a1b1e' }}>
          {name}
        </span>
        <span className="text-sm" style={{ color: '#666666' }}>
          on
        </span>
        <img src={chain.logo} alt={chain.name} className="h-5 w-5" />
        <span className="text-sm" style={{ color: '#666666' }}>
          {chain.name}
        </span>
      </div>
    )
  }

  if (isLoading || providerOptions.length === 0) {
    return null
  }

  // Single provider — no selector needed
  if (providerOptions.length === 1) {
    return null
  }

  const selected = providerOptions.find((o) => o.provider === selectedProvider)

  return (
    <div
      className="w-full relative mb-3"
      style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      ref={dropdownRef}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-3 transition-all hover:bg-gray-50"
        style={{
          border: '1px solid #E0E2EB',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
        }}
      >
        {selected ? (
          renderOption(selected)
        ) : (
          <span className="text-sm" style={{ color: '#666666' }}>
            Select a provider
          </span>
        )}
        <svg
          className="w-4 h-4 transition-transform ml-2"
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
          className="absolute left-0 right-0 mt-1 shadow-lg overflow-hidden"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E0E2EB',
            borderRadius: '12px',
            zIndex: 50,
          }}
        >
          <div className="py-2">
            {providerOptions
              .filter((o) => o.provider !== selectedProvider)
              .map((option, index) => (
                <button
                  key={option.provider}
                  onClick={() => handleClick(option.provider)}
                  className="w-full px-4 py-3 flex items-center transition-all hover:bg-gray-50"
                  style={{
                    borderTop: index > 0 ? '1px solid #E0E2EB' : 'none',
                  }}
                >
                  {renderOption(option)}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
