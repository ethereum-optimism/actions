import {
  type BorrowMarketConfig,
  ETH,
  type LendMarketConfig,
  OP_DEMO,
  USDC_DEMO,
  WETH,
} from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'
import { baseSepolia, optimismSepolia } from 'viem/chains'

export { OP_DEMO, USDC_DEMO }

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

export const MorphoBorrowDemo: BorrowMarketConfig = {
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

const BORROW_MARKET_CONFIGS: readonly BorrowMarketConfig[] = [MorphoBorrowDemo]

/**
 * On-chain ERC-4626 vault (the Morpho `collateralToken`) backing a borrow
 * market's collateral, resolved from local config by marketId. The SDK's
 * `BorrowMarket` read shape doesn't surface it, so the demo looks it up here.
 */
export function borrowCollateralVault(marketId: {
  kind: string
  marketId: string
  chainId: number
}): Address | undefined {
  return BORROW_MARKET_CONFIGS.find(
    (c) =>
      c.kind === marketId.kind &&
      c.marketId === marketId.marketId &&
      c.chainId === marketId.chainId,
  )?.marketParams.collateralToken
}
