import type { LendMarketConfig } from '@eth-optimism/actions-sdk/react'
import { baseSepolia } from 'viem/chains'
import { USDC_DEMO } from './assets'

export const USDCDemoVault: LendMarketConfig = {
  address: '0x297E324C46309E93112610ebf35559685b4E3547',
  chainId: baseSepolia.id,
  name: 'USDC Demo Vault (Base Sepolia)',
  asset: USDC_DEMO,
  lendProvider: 'morpho',
}
