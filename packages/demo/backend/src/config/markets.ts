import {
  type BorrowMarketConfig,
  ETH,
  type LendMarketConfig,
  USDC,
  WETH,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { baseSepolia, optimismSepolia, unichain } from 'viem/chains'

import { OP_DEMO, USDC_DEMO } from './assets.js'

export const GauntletUSDC: LendMarketConfig = {
  address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as const,
  chainId: unichain.id,
  name: 'Gauntlet USDC',
  asset: USDC,
  lendProvider: 'morpho',
}

export const MorphoUSDCLendDemo: LendMarketConfig = {
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

// ---------- Borrow markets ----------
export const MorphoUSDCBorrowOPDemo: BorrowMarketConfig = {
  kind: 'morpho-blue',
  marketId:
    '0x7dc82421423b50debf8c1f9f967f34367e0fb7bcdb1bda0cef27c319d89cd12f',
  chainId: baseSepolia.id,
  name: 'Demo dUSDC / OP',
  collateralAsset: USDC_DEMO,
  borrowAsset: OP_DEMO,
  borrowProvider: 'morpho',
  lendProvider: 'morpho',
  marketParams: {
    loanToken: '0xD6169405013E92387b78457Fa77d377cE8cD3EE8' as Address,
    collateralToken: '0x018e22BBC6eB3daCfd151d1Cc4Dc72f6337B3eA1' as Address,
    oracle: '0xB31E326bF4BdB5Ab98eF19C16dd420C8d6176e86' as Address,
    irm: '0x46415998764C29aB2a25CbeA6254146D50D22687' as Address,
    lltv: 860000000000000000n,
  },
}
