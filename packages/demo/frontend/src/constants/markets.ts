import {
  type BorrowMarketConfig,
  computeAaveBorrowMarketId,
  ETH,
  getAssetAddress,
  type LendMarketConfig,
  OP_DEMO,
  USDC,
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
  address: getAssetAddress(WETH, optimismSepolia.id),
  chainId: optimismSepolia.id,
  name: 'Aave ETH',
  asset: ETH,
  lendProvider: 'aave',
}

// Aave V3 on Optimism Sepolia: ETH collateral, USDC debt (the only borrowable reserve).
// marketId derived from (chain, WETH, USDC); borrows real USDC via the SDK, not USDC_DEMO.
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
  marketParams: {
    loanToken: '0xD6169405013E92387b78457Fa77d377cE8cD3EE8' as Address,
    collateralToken: '0x018e22BBC6eB3daCfd151d1Cc4Dc72f6337B3eA1' as Address,
    oracle: '0xB31E326bF4BdB5Ab98eF19C16dd420C8d6176e86' as Address,
    irm: '0x46415998764C29aB2a25CbeA6254146D50D22687' as Address,
    lltv: 860000000000000000n,
  },
}

const BORROW_MARKET_CONFIGS: readonly BorrowMarketConfig[] = [
  MorphoUSDCBorrowOPDemo,
]

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

/** Morpho borrow market that uses the given vault as collateral; undefined for non-Morpho lends (e.g. Aave). */
export function morphoBorrowMarketForVault(
  vaultAddress: string,
  chainId: number,
): BorrowMarketConfig | undefined {
  return BORROW_MARKET_CONFIGS.find(
    (c) =>
      c.kind === 'morpho-blue' &&
      c.chainId === chainId &&
      c.marketParams.collateralToken.toLowerCase() ===
        vaultAddress.toLowerCase(),
  )
}
