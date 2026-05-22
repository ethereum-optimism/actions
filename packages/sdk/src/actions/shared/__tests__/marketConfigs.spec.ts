import { describe, expect, it } from 'vitest'

import {
  filterMatchingConfigs,
  findMatchingConfig,
} from '@/actions/shared/marketConfigs.js'

describe('marketConfigs', () => {
  const configs = [
    { chainId: 10, symbol: 'USDC', enabled: true },
    { chainId: 8453, symbol: 'WETH', enabled: true },
    { chainId: 8453, symbol: 'USDC', enabled: false },
  ] as const

  describe('findMatchingConfig', () => {
    it('returns the first config matching the target', () => {
      const match = findMatchingConfig({
        configs,
        target: { chainId: 8453, symbol: 'USDC' },
        matches: (config, target) =>
          config.chainId === target.chainId && config.symbol === target.symbol,
      })

      expect(match).toEqual(configs[2])
    })

    it('returns undefined when nothing matches', () => {
      const match = findMatchingConfig({
        configs,
        target: { chainId: 1, symbol: 'DAI' },
        matches: (config, target) =>
          config.chainId === target.chainId && config.symbol === target.symbol,
      })

      expect(match).toBeUndefined()
    })
  })

  describe('filterMatchingConfigs', () => {
    it('applies only the defined predicates', () => {
      const filtered = filterMatchingConfigs(configs, [
        (config) => config.chainId === 8453,
        undefined,
        (config) => config.enabled,
      ])

      expect(filtered).toEqual([configs[1]])
    })

    it('returns an empty list for missing configs', () => {
      expect(filterMatchingConfigs(undefined, [])).toEqual([])
    })
  })
})
