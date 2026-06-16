import {
  type BorrowMarketConfig,
  computeAaveBorrowMarketId,
  ETH,
  getAssetAddress,
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
  address: getAssetAddress(WETH, optimismSepolia.id),
  chainId: optimismSepolia.id,
  name: 'Aave ETH',
  asset: ETH,
  lendProvider: 'aave',
}

// ---------- Borrow markets ----------

// Real Aave V3 borrow market on OP Sepolia: real ETH collateral, real USDC
// debt. The demo mirrors the borrowed USDC as USDC_DEMO on Base Sepolia in the
// backend (see services/mirror.ts); the SDK provider itself only touches real
// Aave. Synthetic market id derived from the (chain, WETH, USDC) triple.
const AAVE_OP_SEPOLIA_WETH = getAssetAddress(WETH, optimismSepolia.id)
const AAVE_OP_SEPOLIA_USDC = getAssetAddress(USDC, optimismSepolia.id)

export const AaveETHBorrowUSDCDemo: BorrowMarketConfig = {
  kind: 'aave-v3',
  marketId: computeAaveBorrowMarketId({
    chainId: optimismSepolia.id,
    collateralAddress: AAVE_OP_SEPOLIA_WETH,
    debtAddress: AAVE_OP_SEPOLIA_USDC,
  }),
  chainId: optimismSepolia.id,
  name: 'Aave ETH / USDC',
  collateralAsset: ETH,
  borrowAsset: USDC,
  borrowProvider: 'aave',
  lendProvider: 'aave',
  aave: {
    debtReserve: AAVE_OP_SEPOLIA_USDC,
    collateralReserve: AAVE_OP_SEPOLIA_WETH,
    collateralUsesWethGateway: true,
  },
}

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
