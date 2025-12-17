import type { Asset, LendMarketConfig } from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'
import { baseSepolia, optimismSepolia } from 'viem/chains'

export const USDC_DEMO: Asset = {
  address: {
    [baseSepolia.id]: '0xb1b0FE886cE376F28987Ad24b1759a8f0A7dd839',
  },
  metadata: {
    decimals: 6,
    name: 'USDC',
    symbol: 'USDC_DEMO',
  },
  type: 'erc20',
}

export const WETH: Asset = {
  address: {
    [optimismSepolia.id]: '0x4200000000000000000000000000000000000006',
  },
  metadata: {
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH',
  },
  type: 'erc20',
}

export const GauntletUSDCDemo: LendMarketConfig = {
  address: '0x018e22BBC6eB3daCfd151d1Cc4Dc72f6337B3eA1' as Address,
  chainId: baseSepolia.id,
  name: 'Gauntlet USDC',
  asset: USDC_DEMO,
  lendProvider: 'morpho',
}

export const AaveWETH: LendMarketConfig = {
  address: '0x4200000000000000000000000000000000000006' as Address,
  chainId: optimismSepolia.id,
  name: 'Aave ETH',
  asset: WETH,
  lendProvider: 'aave',
}
