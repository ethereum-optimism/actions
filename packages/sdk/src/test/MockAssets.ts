import type { Address } from 'viem'

import type { Asset } from '@/types/token.js'

/**
 * Mock USDC asset for testing
 */
export const MockUSDCAsset: Asset = {
  address: {
    130: '0xA0b86991c431c924C2407E4C573C686cc8C6c5b7' as Address,
  },
  metadata: {
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
  },
  type: 'erc20',
}

/**
 * Mock WETH asset for testing
 */
export const MockWETHAsset: Asset = {
  address: {
    130: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address,
  },
  metadata: {
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH',
  },
  type: 'erc20',
}
