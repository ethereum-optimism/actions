import {
  ETH,
  getAssetAddress,
  type LendMarketConfig,
  WETH,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { baseSepolia, optimismSepolia, unichain } from 'viem/chains'

import { USDC, USDC_DEMO } from './assets.js'

export const GauntletUSDC: LendMarketConfig = {
  address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as Address,
  chainId: unichain.id,
  name: 'Gauntlet USDC',
  asset: USDC,
  lendProvider: 'morpho',
}

export const GauntletUSDCDemo: LendMarketConfig = {
  address: '0x018e22BBC6eB3daCfd151d1Cc4Dc72f6337B3eA1' as Address,
  chainId: baseSepolia.id,
  name: 'Gauntlet USDC',
  asset: USDC_DEMO,
  lendProvider: 'morpho',
}

export const AaveETH: LendMarketConfig = {
  address: getAssetAddress(WETH, optimismSepolia.id),
  chainId: optimismSepolia.id,
  name: 'Aave ETH',
  asset: ETH, // Developer configures ETH, SDK handles WETH internally
  lendProvider: 'aave',
}

// Export all markets for easy consumption
export const ALL_MARKETS = [GauntletUSDCDemo, AaveETH]
