import { describe, expect, it } from 'vitest'

import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { resolveMarket } from '@/resolvers/markets.js'

const config = getDemoConfig()

describe('resolveMarket', () => {
  it('matches by exact .name', () => {
    const market = resolveMarket('Gauntlet USDC', config)
    expect(market.name).toBe('Gauntlet USDC')
    expect(market.lendProvider).toBe('morpho')
  })

  it('matches case-insensitively and ignores hyphens / spaces', () => {
    expect(resolveMarket('gauntlet-usdc', config).name).toBe('Gauntlet USDC')
    expect(resolveMarket('GAUNTLETUSDC', config).name).toBe('Gauntlet USDC')
    expect(resolveMarket('aave eth', config).name).toBe('Aave ETH')
    expect(resolveMarket('aave-eth', config).name).toBe('Aave ETH')
  })

  it('walks every provider allowlist', () => {
    expect(resolveMarket('Aave ETH', config).lendProvider).toBe('aave')
    expect(resolveMarket('Gauntlet USDC', config).lendProvider).toBe('morpho')
  })

  it('throws CliError(validation) with allowed list on miss', () => {
    try {
      resolveMarket('does-not-exist', config)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect(
        ((err as CliError).details as { allowed: string[] }).allowed,
      ).toEqual(['Gauntlet USDC', 'Aave ETH'])
    }
  })

  it('returns a market entry carrying address, chainId, asset, provider', () => {
    const m = resolveMarket('Gauntlet USDC', config)
    expect(m.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(typeof m.chainId).toBe('number')
    expect(m.asset.metadata.symbol).toBe('USDC_DEMO')
  })
})
