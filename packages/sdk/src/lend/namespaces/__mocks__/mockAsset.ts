import { getRandomAddress } from '@/test/utils.js'
import type { Asset } from '@/types/index.js'

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
