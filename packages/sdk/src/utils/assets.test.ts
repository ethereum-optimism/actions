import { describe, expect, it } from 'vitest'

import { MockUSDCAsset, MockWETHAsset } from '@/__mocks__/MockAssets.js'
import { isAssetSupportedOnChain, parseAssetAmount } from '@/utils/assets.js'

describe('Asset Utilities', () => {
  describe('isAssetSupportedOnChain', () => {
    it('should return true for asset on supported chain', () => {
      expect(isAssetSupportedOnChain(MockUSDCAsset, 130)).toBe(true)
    })

    it('should return false for asset on unsupported chain', () => {
      expect(isAssetSupportedOnChain(MockUSDCAsset, 999 as any)).toBe(false)
    })

    it('should return correct metadata for MockUSDCAsset', () => {
      expect(MockUSDCAsset.metadata.symbol).toBe('USDC')
      expect(MockUSDCAsset.metadata.decimals).toBe(6)
      expect(MockUSDCAsset.type).toBe('erc20')
    })

    it('should return correct metadata for MockWETHAsset', () => {
      expect(MockWETHAsset.metadata.symbol).toBe('WETH')
      expect(MockWETHAsset.metadata.decimals).toBe(18)
      expect(MockWETHAsset.type).toBe('erc20')
    })
  })

  describe('parseAssetAmount', () => {
    it('converts human-readable amount to wei using asset decimals', () => {
      expect(parseAssetAmount(100, MockUSDCAsset)).toBe(100000000n)
      expect(parseAssetAmount(1, MockWETHAsset)).toBe(1000000000000000000n)
    })

    it('returns undefined when amount is undefined', () => {
      expect(parseAssetAmount(undefined, MockUSDCAsset)).toBeUndefined()
    })

    it('handles fractional amounts', () => {
      expect(parseAssetAmount(0.5, MockUSDCAsset)).toBe(500000n)
    })
  })
})
