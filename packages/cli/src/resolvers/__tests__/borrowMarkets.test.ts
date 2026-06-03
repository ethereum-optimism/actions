import { describe, expect, it } from 'vitest'

import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import {
  configuredBorrowMarkets,
  resolveBorrowMarket,
} from '@/resolvers/borrowMarkets.js'

const markets = configuredBorrowMarkets(getDemoConfig())

describe('resolveBorrowMarket', () => {
  it('matches by exact .name', () => {
    const market = resolveBorrowMarket('Demo dUSDC / OP', markets)
    expect(market.name).toBe('Demo dUSDC / OP')
    expect(market.borrowProvider).toBe('morpho')
  })

  it('matches case-insensitively and ignores hyphens / spaces', () => {
    expect(resolveBorrowMarket('demo-dusdc-op', markets).name).toBe(
      'Demo dUSDC / OP',
    )
    expect(resolveBorrowMarket('DEMODUSDC/OP', markets).name).toBe(
      'Demo dUSDC / OP',
    )
  })

  it('throws CliError(validation) with allowed list on miss', () => {
    try {
      resolveBorrowMarket('does-not-exist', markets)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/Unknown borrow market/)
      const details = (err as CliError).details as {
        allowed: Array<{
          name: string
          chainId: number
          collateral: string
          borrow: string
        }>
      }
      expect(details.allowed.map((m) => m.name)).toEqual([
        'Demo dUSDC / OP',
        'Aave ETH / USDC',
      ])
      for (const m of details.allowed) {
        expect(typeof m.chainId).toBe('number')
        expect(typeof m.collateral).toBe('string')
        expect(typeof m.borrow).toBe('string')
      }
    }
  })

  it('returns a market entry that carries the full discriminated config', () => {
    const m = resolveBorrowMarket('Demo dUSDC / OP', markets)
    expect(m.kind).toBe('morpho-blue')
    expect(m.marketId).toMatch(/^0x[a-fA-F0-9]{64}$/)
    expect(typeof m.chainId).toBe('number')
    expect(m.collateralAsset.metadata.symbol).toBe('USDC_DEMO')
    expect(m.borrowAsset.metadata.symbol).toBe('OP_DEMO')
    if (m.kind !== 'morpho-blue')
      throw new Error('expected a morpho-blue market')
    expect(m.marketParams.lltv).toBe(860000000000000000n)
  })
})

describe('configuredBorrowMarkets', () => {
  it('flattens every provider allowlist', () => {
    const all = configuredBorrowMarkets(getDemoConfig())
    expect(all.map((m) => m.name)).toEqual([
      'Demo dUSDC / OP',
      'Aave ETH / USDC',
    ])
  })

  it('returns an empty array when config.borrow is omitted', () => {
    const cfg = { ...getDemoConfig(), borrow: undefined }
    expect(configuredBorrowMarkets(cfg)).toEqual([])
  })
})

describe('resolveBorrowMarket collision behaviour', () => {
  it('throws CliError(validation) with matches list when two providers normalise to the same name', () => {
    const dup: typeof markets = [
      { ...markets[0]!, name: 'Dup' },
      { ...markets[0]!, name: 'dup' },
    ]
    try {
      resolveBorrowMarket('dup', dup)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/Ambiguous/)
      const details = (err as CliError).details as {
        matches: Array<{ provider: string }>
      }
      expect(details.matches).toHaveLength(2)
    }
  })
})
