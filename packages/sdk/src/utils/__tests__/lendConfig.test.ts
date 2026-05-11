import { describe, expect, it } from 'vitest'

import { MockUSDCAsset } from '@/__mocks__/MockAssets.js'
import type { LendConfig } from '@/types/actions.js'
import type { LendMarketConfig } from '@/types/lend/base.js'
import { getLendMarketAllowlist } from '@/utils/lendConfig.js'

const morphoMarket: LendMarketConfig = {
  address: '0x0000000000000000000000000000000000000001',
  chainId: 130,
  name: 'Morpho USDC',
  asset: MockUSDCAsset,
  lendProvider: 'morpho',
}

const aaveMarket: LendMarketConfig = {
  address: '0x0000000000000000000000000000000000000002',
  chainId: 130,
  name: 'Aave USDC',
  asset: MockUSDCAsset,
  lendProvider: 'aave',
}

describe('getLendMarketAllowlist', () => {
  it('returns empty list when lend config is undefined', () => {
    expect(getLendMarketAllowlist(undefined)).toEqual([])
  })

  it('flattens allowlists across all providers', () => {
    const lend: LendConfig = {
      morpho: { marketAllowlist: [morphoMarket] },
      aave: { marketAllowlist: [aaveMarket] },
    }
    expect(getLendMarketAllowlist(lend)).toEqual([morphoMarket, aaveMarket])
  })

  it('skips the settings sibling key', () => {
    const lend: LendConfig = {
      morpho: { marketAllowlist: [morphoMarket] },
      settings: { approvalMode: 'max' },
    }
    expect(getLendMarketAllowlist(lend)).toEqual([morphoMarket])
  })

  it('returns empty list when no provider declares an allowlist', () => {
    const lend: LendConfig = {
      morpho: {},
      settings: { approvalMode: 'exact' },
    }
    expect(getLendMarketAllowlist(lend)).toEqual([])
  })
})
