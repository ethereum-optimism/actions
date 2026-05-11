import {
  ETH,
  type LendMarketConfig,
  USDC,
  WETH,
} from '@eth-optimism/actions-sdk'
import type { Address, Hex } from 'viem'
import { baseSepolia, optimismSepolia, unichain } from 'viem/chains'

import type { BorrowMarketConfig } from '@/types/borrow-sdk-stubs.js'

import { OP_DEMO, USDC_DEMO } from './assets.js'

export const GauntletUSDC: LendMarketConfig = {
  address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as const,
  chainId: unichain.id,
  name: 'Gauntlet USDC',
  asset: USDC,
  lendProvider: 'morpho',
}

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

// Export all markets for easy consumption
export const ALL_MARKETS = [GauntletUSDCDemo, AaveETH]

// ---------- Borrow markets ----------

// TODO: replace placeholder once the borrow deploy script runs and writes the
// real bytes32 id into packages/demo/contracts/state/deployments.json
// (morpho.borrow.marketId on chain 84532). The deploy script is
// `packages/demo/contracts/script/DeployMorphoBorrowMarket.s.sol` (PR #2).
const PLACEHOLDER_MORPHO_BORROW_MARKET_ID: Hex =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

export const MorphoBorrowDemo: BorrowMarketConfig = {
  kind: 'morpho-blue',
  marketId: PLACEHOLDER_MORPHO_BORROW_MARKET_ID,
  chainId: baseSepolia.id,
  name: 'Demo dUSDC / OP',
  collateralAsset: USDC_DEMO,
  borrowAsset: OP_DEMO,
  borrowProvider: 'morpho',
  lendProvider: 'morpho',
}

export const ALL_BORROW_MARKETS: BorrowMarketConfig[] = [MorphoBorrowDemo]
