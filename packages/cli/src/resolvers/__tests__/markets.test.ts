import { describe, expect, it } from 'vitest'

import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { collectMarkets, resolveMarket } from '@/resolvers/markets.js'

const markets = collectMarkets(getDemoConfig())

describe('resolveMarket', () => {
  it('matches by exact .name', () => {
    const market = resolveMarket('Gauntlet USDC', markets)
    expect(market.name).toBe('Gauntlet USDC')
    expect(market.lendProvider).toBe('morpho')
  })

  it('matches case-insensitively and ignores hyphens / spaces', () => {
    expect(resolveMarket('gauntlet-usdc', markets).name).toBe('Gauntlet USDC')
    expect(resolveMarket('GAUNTLETUSDC', markets).name).toBe('Gauntlet USDC')
    expect(resolveMarket('aave eth', markets).name).toBe('Aave ETH')
    expect(resolveMarket('aave-eth', markets).name).toBe('Aave ETH')
  })

  it('walks every provider allowlist', () => {
    expect(resolveMarket('Aave ETH', markets).lendProvider).toBe('aave')
    expect(resolveMarket('Gauntlet USDC', markets).lendProvider).toBe('morpho')
  })

  it('throws CliError(validation) with allowed list on miss', () => {
    try {
      resolveMarket('does-not-exist', markets)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      const details = (err as CliError).details as {
        allowed: Array<{ name: string; chainId: number; symbol: string }>
      }
      expect(details.allowed.map((m) => m.name)).toEqual([
        'Gauntlet USDC',
        'Aave ETH',
      ])
      for (const m of details.allowed) {
        expect(typeof m.chainId).toBe('number')
        expect(typeof m.symbol).toBe('string')
      }
    }
  })

  it('returns a market entry carrying address, chainId, asset, provider', () => {
    const m = resolveMarket('Gauntlet USDC', markets)
    expect(m.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(typeof m.chainId).toBe('number')
    expect(m.asset.metadata.symbol).toBe('USDC_DEMO')
  })
})

describe('collectMarkets', () => {
  it('flattens every provider allowlist and skips the settings sibling', () => {
    const all = collectMarkets(getDemoConfig())
    expect(all.map((m) => m.name)).toEqual(['Gauntlet USDC', 'Aave ETH'])
  })
})

describe('resolveMarket collision behaviour', () => {
  it('throws CliError(validation) with matches list when two providers normalise to the same name', () => {
    const dup: typeof markets = [
      { ...markets[0]!, name: 'USDC' },
      { ...markets[1]!, name: 'usdc', lendProvider: 'aave' as const },
    ]
    try {
      resolveMarket('usdc', dup)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/Ambiguous/)
      const details = (err as CliError).details as {
        matches: Array<{ provider: string }>
      }
      expect(details.matches.map((m) => m.provider).sort()).toEqual([
        'aave',
        'morpho',
      ])
    }
  })
})
