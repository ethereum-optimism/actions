import type { Address } from 'viem'

import { MockUSDCAsset, MockWETHAsset } from '@/test/MockAssets.js'
import type { LendMarketConfig } from '@/types/lend/index.js'

/**
 * Mock Gauntlet USDC market configuration for testing
 */
export const MockGauntletUSDCMarket: LendMarketConfig = {
  address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as Address,
  chainId: 130,
  name: 'Gauntlet USDC',
  asset: MockUSDCAsset,
  lendProvider: 'morpho',
}

/**
 * Mock WETH market configuration for testing
 */
export const MockWETHMarket: LendMarketConfig = {
  address: '0x1234567890123456789012345678901234567890' as Address,
  chainId: 130,
  name: 'Test WETH Market',
  asset: MockWETHAsset,
  lendProvider: 'morpho',
}

/**
 * Mock receiver address for testing
 */
export const MockReceiverAddress =
  '0x1234567890123456789012345678901234567890' as Address
