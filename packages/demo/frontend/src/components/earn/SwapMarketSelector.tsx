import { useMemo } from 'react'
import type { SwapMarket } from '@eth-optimism/actions-sdk/react'

import {
  CHAIN_DISPLAY,
  DEFAULT_CHAIN,
  MARKET_LOGO,
} from '@/constants/logos'
import { getProviderDisplayName } from '@/constants/providers'

import { Dropdown } from './Dropdown'

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
