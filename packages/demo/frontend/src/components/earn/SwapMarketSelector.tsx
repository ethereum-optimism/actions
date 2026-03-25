import { useMemo, useState } from 'react'
import type { SwapMarket } from '@eth-optimism/actions-sdk/react'

import {
  CHAIN_DISPLAY,
  DEFAULT_CHAIN,
  MARKET_LOGO,
} from '@/constants/logos'
import { getProviderDisplayName } from '@/constants/providers'

import { Dropdown } from './Dropdown'

export function DemoProviderTooltip() {
  const [visible, setVisible] = useState(false)
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        style={{ cursor: 'pointer', flexShrink: 0 }}
      >
        <circle cx="8" cy="8" r="7" stroke="#9195A6" strokeWidth="1.5" />
        <text
          x="8"
          y="11.5"
          textAnchor="middle"
          fontSize="10"
          fontWeight="600"
          fill="#9195A6"
          fontFamily="Inter, system-ui, sans-serif"
        >
          i
        </text>
      </svg>
      {visible && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '260px',
            padding: '12px',
            backgroundColor: '#1a1b1e',
            color: '#fff',
            borderRadius: '8px',
            fontSize: '12px',
            lineHeight: '1.5',
            zIndex: 100,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          }}
        >
          <div style={{ color: '#b0b3be', marginBottom: '6px' }}>
            Provider selection for demo purposes only.
          </div>
          <div style={{ color: '#b0b3be' }}>
            <code style={{ color: '#fff', fontSize: '11px' }}>
              wallet.swap
            </code>{' '}
            will default to the best price across all providers unless otherwise
            specified.
          </div>
          <div
            style={{
              position: 'absolute',
              top: '-4px',
              left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              width: '8px',
              height: '8px',
              backgroundColor: '#1a1b1e',
            }}
          />
        </div>
      )}
    </div>
  )
}

interface ProviderOption {
  provider: string
  chainId: number
}

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
  const providerOptions = useMemo(() => {
    const seen = new Map<string, ProviderOption>()
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

  if (isLoading || providerOptions.length <= 1) {
    return null
  }

  const selected =
    providerOptions.find((o) => o.provider === selectedProvider) ?? null

  return (
    <Dropdown<ProviderOption>
      options={providerOptions}
      selected={selected}
      onSelect={(o) => onSelect(o.provider)}
      keyOf={(o) => o.provider}
      isSelected={(o, sel) => o.provider === sel?.provider}
      placeholder="Select a provider"
      renderOption={(option) => {
        const chain = CHAIN_DISPLAY[option.chainId] ?? DEFAULT_CHAIN
        const name = getProviderDisplayName(option.provider, option.chainId)
        return (
          <div className="flex items-center gap-2 flex-1">
            <img
              src={MARKET_LOGO[name] ?? ''}
              alt={name}
              className="h-6 w-6"
            />
            <span
              className="text-sm font-medium"
              style={{ color: '#1a1b1e' }}
            >
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
      }}
    />
  )
}
