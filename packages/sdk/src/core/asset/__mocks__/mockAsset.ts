import { getRandomAddress } from '@/__mocks__/utils.js'
import type { Asset } from '@/types/asset.js'

/**
 * Creates a mock USDC asset for testing
 */
export function createMockUSDCAsset(chainId: number = 130): Asset {
  return {
    address: { [chainId]: getRandomAddress() },
    metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    type: 'erc20' as const,
  }
}
