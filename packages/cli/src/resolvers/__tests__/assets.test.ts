import type { Asset } from '@eth-optimism/actions-sdk'
import { baseSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { CliError } from '@/output/errors.js'
import { resolveAsset } from '@/resolvers/assets.js'

const USDC: Asset = {
  address: { [baseSepolia.id]: '0x0000000000000000000000000000000000000001' },
  metadata: { decimals: 6, name: 'USDC', symbol: 'USDC_DEMO' },
  type: 'erc20',
}

const ETH: Asset = {
  address: { [baseSepolia.id]: 'native' },
  metadata: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  type: 'native',
}

describe('resolveAsset', () => {
  it('matches exact symbols', () => {
    expect(resolveAsset('USDC_DEMO', [USDC, ETH])).toBe(USDC)
  })

  it('is case-insensitive', () => {
    expect(resolveAsset('eth', [USDC, ETH])).toBe(ETH)
    expect(resolveAsset('Usdc_Demo', [USDC, ETH])).toBe(USDC)
  })

  it('throws CliError(validation) for unknown symbols', () => {
    try {
      resolveAsset('WBTC', [USDC, ETH])
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).details).toEqual({
        symbol: 'WBTC',
        allowed: ['USDC_DEMO', 'ETH'],
      })
    }
  })

  it('throws on an empty allowlist', () => {
    expect(() => resolveAsset('ETH', [])).toThrow(CliError)
  })
})
