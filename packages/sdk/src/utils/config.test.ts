import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import { MockGauntletUSDCMarket, MockWETHMarket } from '@/test/MockMarkets.js'

import { findMarketInAllowlist } from './config.js'

describe('Config Utilities', () => {
  describe('findMarketInAllowlist', () => {
    it('should find market in allowlist by address and chainId', () => {
      const marketAllowlist = [MockGauntletUSDCMarket, MockWETHMarket]

      const result = findMarketInAllowlist(marketAllowlist, {
        address: MockGauntletUSDCMarket.address,
        chainId: MockGauntletUSDCMarket.chainId,
      })

      expect(result).toEqual(MockGauntletUSDCMarket)
    })

    it('should return undefined if market not found in allowlist', () => {
      const marketAllowlist = [MockGauntletUSDCMarket]

      const result = findMarketInAllowlist(marketAllowlist, {
        address: '0x9999999999999999999999999999999999999999' as Address,
        chainId: 130,
      })

      expect(result).toBeUndefined()
    })

    it('should return undefined if allowlist is undefined', () => {
      const result = findMarketInAllowlist(undefined, {
        address: MockGauntletUSDCMarket.address,
        chainId: MockGauntletUSDCMarket.chainId,
      })

      expect(result).toBeUndefined()
    })

    it('should match address case-insensitively', () => {
      const marketAllowlist = [MockGauntletUSDCMarket]

      const result = findMarketInAllowlist(marketAllowlist, {
        address: MockGauntletUSDCMarket.address.toUpperCase() as Address,
        chainId: MockGauntletUSDCMarket.chainId,
      })

      expect(result).toEqual(MockGauntletUSDCMarket)
    })

    it('should not match if chainId differs', () => {
      const marketAllowlist = [MockGauntletUSDCMarket]

      const result = findMarketInAllowlist(marketAllowlist, {
        address: MockGauntletUSDCMarket.address,
        chainId: 84532,
      })

      expect(result).toBeUndefined()
    })
  })
})
