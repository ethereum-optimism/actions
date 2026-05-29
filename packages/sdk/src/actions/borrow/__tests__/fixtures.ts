import { baseSepolia } from 'viem/chains'

import { computeMorphoMarketId } from '@/actions/borrow/providers/morpho/marketParams.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type {
  MorphoBorrowMarketConfig,
  MorphoMarketParams,
} from '@/types/borrow/index.js'

export const BASE_SEPOLIA_ID = baseSepolia.id as SupportedChainId
export const walletAddress =
  '0x000000000000000000000000000000000000beef' as const

export const collateralAsset = {
  type: 'erc20',
  address: { [BASE_SEPOLIA_ID]: '0xb1b0fe886ce376f28987ad24b1759a8f0a7dd839' },
  metadata: { symbol: 'dUSDC', name: 'dUSDC', decimals: 18 },
} satisfies Asset

export const borrowAsset = {
  type: 'erc20',
  address: { [BASE_SEPOLIA_ID]: '0xd6169405013e92387b78457fa77d377ce8cd3ee8' },
  metadata: { symbol: 'OP', name: 'OP', decimals: 18 },
} satisfies Asset

export const marketParams: MorphoMarketParams = {
  loanToken: '0xd6169405013e92387b78457fa77d377ce8cd3ee8',
  collateralToken: '0xb1b0fe886ce376f28987ad24b1759a8f0a7dd839',
  oracle: '0x0000000000000000000000000000000000000aaa',
  irm: '0x46415998764c29ab2a25cbea6254146d50d22687',
  lltv: 860000000000000000n,
}

export const market: MorphoBorrowMarketConfig = {
  kind: 'morpho-blue',
  marketId: computeMorphoMarketId(marketParams),
  chainId: BASE_SEPOLIA_ID,
  name: 'Test market',
  collateralAsset,
  borrowAsset,
  borrowProvider: 'morpho',
  lendProvider: 'morpho',
  marketParams,
}

export const otherMarketParams: MorphoMarketParams = {
  ...marketParams,
  oracle: '0x0000000000000000000000000000000000000bbb',
}

export const otherMarket: MorphoBorrowMarketConfig = {
  ...market,
  marketId: computeMorphoMarketId(otherMarketParams),
  name: 'Second test market',
  marketParams: otherMarketParams,
}
