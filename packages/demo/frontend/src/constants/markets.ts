import type { LendMarketConfig } from '@eth-optimism/actions-sdk/react'
import { baseSepolia, optimismSepolia } from 'viem/chains'
import { USDC_DEMO, WETH } from './assets'

export const USDCDemoVault: LendMarketConfig = {
  address: '0x297E324C46309E93112610ebf35559685b4E3547',
  chainId: baseSepolia.id,
  name: 'USDC Demo Vault (Base Sepolia)',
  asset: USDC_DEMO,
  lendProvider: 'morpho',
}

export const AaveETH: LendMarketConfig = {
  address: '0x4200000000000000000000000000000000000006',
  chainId: optimismSepolia.id,
  name: 'Aave ETH',
  asset: WETH,
  lendProvider: 'aave',
}

export const ALL_MARKETS = [USDCDemoVault, AaveETH]
