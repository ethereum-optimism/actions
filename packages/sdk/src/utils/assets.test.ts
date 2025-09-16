import { base, baseSepolia, mainnet, unichain } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import type { Asset } from '@/types/token.js'

import { isAssetSupportedOnChain } from './assets.js'

// Test assets for testing purposes only
const ETH: Asset = {
  address: {
    [mainnet.id]: 'native',
    [unichain.id]: 'native',
    [base.id]: 'native',
    [baseSepolia.id]: 'native',
  },
  metadata: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  type: 'native',
}

const USDC: Asset = {
  address: {
    [mainnet.id]: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    [unichain.id]: '0x078d782b760474a361dda0af3839290b0ef57ad6',
    [baseSepolia.id]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  metadata: {
    decimals: 6,
    name: 'USDC',
    symbol: 'USDC',
  },
  type: 'erc20',
}

const USDC_DEMO: Asset = {
  address: {
    [baseSepolia.id]: '0x87c25229afbc30418d0144e8dfb2bcf8efd92c6c',
  },
  metadata: {
    decimals: 6,
    name: 'USDC Demo',
    symbol: 'USDC_DEMO',
  },
  type: 'erc20',
}

const MORPHO: Asset = {
  address: {
    [mainnet.id]: '0x58D97B57BB95320F9a05dC918Aef65434969c2B2',
    [base.id]: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
  },
  metadata: {
    decimals: 18,
    name: 'Morpho Token',
    symbol: 'MORPHO',
  },
  type: 'erc20',
}

describe('Asset Utilities', () => {
  describe('isAssetSupportedOnChain', () => {
    it('should return true for ETH on all supported chains', () => {
      expect(isAssetSupportedOnChain(ETH, mainnet.id)).toBe(true)
      expect(isAssetSupportedOnChain(ETH, unichain.id)).toBe(true)
      expect(isAssetSupportedOnChain(ETH, base.id)).toBe(true)
      expect(isAssetSupportedOnChain(ETH, baseSepolia.id)).toBe(true)
    })

    it('should return true for USDC on supported chains', () => {
      expect(isAssetSupportedOnChain(USDC, mainnet.id)).toBe(true)
      expect(isAssetSupportedOnChain(USDC, unichain.id)).toBe(true)
      expect(isAssetSupportedOnChain(USDC, baseSepolia.id)).toBe(true)
    })

    it('should return false for USDC on unsupported chains', () => {
      expect(isAssetSupportedOnChain(USDC, base.id)).toBe(false)
    })

    it('should return true for MORPHO on supported chains', () => {
      expect(isAssetSupportedOnChain(MORPHO, mainnet.id)).toBe(true)
      expect(isAssetSupportedOnChain(MORPHO, base.id)).toBe(true)
    })

    it('should return false for MORPHO on unsupported chains', () => {
      expect(isAssetSupportedOnChain(MORPHO, unichain.id)).toBe(false)
      expect(isAssetSupportedOnChain(MORPHO, baseSepolia.id)).toBe(false)
    })

    it('should return correct support for USDC_DEMO', () => {
      expect(isAssetSupportedOnChain(USDC_DEMO, baseSepolia.id)).toBe(true)
      expect(isAssetSupportedOnChain(USDC_DEMO, mainnet.id)).toBe(false)
      expect(isAssetSupportedOnChain(USDC_DEMO, unichain.id)).toBe(false)
      expect(isAssetSupportedOnChain(USDC_DEMO, base.id)).toBe(false)
    })
  })


  describe('Asset definitions', () => {
    it('should have correct ETH metadata', () => {
      expect(ETH.metadata).toEqual({
        decimals: 18,
        name: 'Ethereum',
        symbol: 'ETH',
      })
      expect(ETH.type).toBe('native')
    })

    it('should have correct USDC metadata', () => {
      expect(USDC.metadata).toEqual({
        decimals: 6,
        name: 'USDC',
        symbol: 'USDC',
      })
      expect(USDC.type).toBe('erc20')
    })

    it('should have correct MORPHO metadata', () => {
      expect(MORPHO.metadata).toEqual({
        decimals: 18,
        name: 'Morpho Token',
        symbol: 'MORPHO',
      })
      expect(MORPHO.type).toBe('erc20')
    })

    it('should have correct USDC_DEMO metadata', () => {
      expect(USDC_DEMO.metadata).toEqual({
        decimals: 6,
        name: 'USDC Demo',
        symbol: 'USDC_DEMO',
      })
      expect(USDC_DEMO.type).toBe('erc20')
    })
  })
})
