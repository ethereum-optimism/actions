import type { Address } from 'viem'

import type { LendMarket } from '@/types/lend/index.js'

/**
 * Creates mock Aave reserve data for testing
 */
export function createMockAaveReserve(): LendMarket {
  return {
    marketId: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address, // USDC on Base
      chainId: 8453,
    },
    name: 'Aave USDC Base',
    asset: {
      metadata: {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
      },
      address: {
        8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
      },
      type: 'erc20',
    },
    supply: {
      totalAssets: BigInt(10000000e6),
      totalShares: BigInt(10000000e6),
    },
    apy: {
      total: 0.0325, // 3.25%
      native: 0.0325,
      totalRewards: 0,
      performanceFee: 0,
    },
    metadata: {
      owner: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as Address,
      curator: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as Address,
      fee: 0,
      lastUpdate: Math.floor(Date.now() / 1000),
    },
  }
}

/**
 * Creates mock WETH reserve data for testing
 */
export function createMockWETHReserve(): LendMarket {
  return {
    marketId: {
      address: '0x4200000000000000000000000000000000000006' as Address, // WETH on OP Stack
      chainId: 8453,
    },
    name: 'Aave WETH Base',
    asset: {
      metadata: {
        name: 'Wrapped Ether',
        symbol: 'WETH',
        decimals: 18,
      },
      address: {
        8453: '0x4200000000000000000000000000000000000006' as Address,
      },
      type: 'erc20',
    },
    supply: {
      totalAssets: BigInt(5000e18),
      totalShares: BigInt(5000e18),
    },
    apy: {
      total: 0.018, // 1.8%
      native: 0.018,
      totalRewards: 0,
      performanceFee: 0,
    },
    metadata: {
      owner: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as Address,
      curator: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as Address,
      fee: 0,
      lastUpdate: Math.floor(Date.now() / 1000),
    },
  }
}
