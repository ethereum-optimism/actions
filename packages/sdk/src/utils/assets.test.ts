import { describe, expect, it } from 'vitest'

import { MockUSDCAsset, MockWETHAsset } from '@/test/MockAssets.js'
import { isAssetSupportedOnChain } from '@/utils/assets.js'

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
})
