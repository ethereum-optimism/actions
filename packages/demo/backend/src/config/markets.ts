import type { LendMarketConfig } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { baseSepolia, optimismSepolia, unichain } from 'viem/chains'

import { USDC, USDC_DEMO, WETH } from './assets.js'

export const GauntletUSDC: LendMarketConfig = {
  address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as Address,
  chainId: unichain.id,
  name: 'Gauntlet USDC',
  asset: USDC,
  lendProvider: 'morpho',
}

export const USDCDemoVault: LendMarketConfig = {
  address: '0x297E324C46309E93112610ebf35559685b4E3547' as Address,
  chainId: baseSepolia.id,
  name: 'USDC Demo Vault (Base Sepolia)',
  asset: USDC_DEMO,
  lendProvider: 'morpho',
}

export const AaveWETHOptimismSepolia: LendMarketConfig = {
  address: '0x4200000000000000000000000000000000000006' as Address,
  chainId: optimismSepolia.id,
  name: 'Aave WETH (Optimism Sepolia)',
  asset: WETH,
  lendProvider: 'aave',
}

// Export all markets for easy consumption
export const ALL_MARKETS = [
  GauntletUSDC,
  USDCDemoVault,
  AaveWETHOptimismSepolia,
]
