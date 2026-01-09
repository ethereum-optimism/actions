import {
  ETH,
  type LendMarketConfig,
  USDC_DEMO,
  WETH,
} from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'
import { baseSepolia, optimismSepolia } from 'viem/chains'

export { USDC_DEMO }

export const GauntletUSDCDemo: LendMarketConfig = {
  address: '0x018e22BBC6eB3daCfd151d1Cc4Dc72f6337B3eA1' as const,
  chainId: baseSepolia.id,
  name: 'Gauntlet USDC',
  asset: USDC_DEMO,
  lendProvider: 'morpho',
}

export const AaveETH: LendMarketConfig = {
  address: WETH.address[optimismSepolia.id] as Address,
  chainId: optimismSepolia.id,
  name: 'Aave ETH',
  asset: ETH,
  lendProvider: 'aave',
}
