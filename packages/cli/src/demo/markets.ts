import {
  type BorrowMarketConfig,
  ETH,
  getAssetAddress,
  type LendMarketConfig,
  OP_DEMO,
  USDC_DEMO,
  WETH,
} from '@eth-optimism/actions-sdk'
import { baseSepolia, optimismSepolia } from 'viem/chains'

/**
 * @description Morpho vault on Base Sepolia used for USDC_DEMO lend demos.
 * Mirrored from `packages/demo/backend/src/config/markets.ts` so the CLI
 * operates against the same demo markets the backend does.
 */
export const GauntletUSDCDemo: LendMarketConfig = {
  address: '0x018e22BBC6eB3daCfd151d1Cc4Dc72f6337B3eA1' as const,
  chainId: baseSepolia.id,
  name: 'Gauntlet USDC',
  asset: USDC_DEMO,
  lendProvider: 'morpho',
}

/**
 * @description Aave v3 ETH market on Optimism Sepolia. The market address is
 * the WETH reserve token - Aave exposes ETH deposits through its WETH
 * gateway. Mirrored from the demo backend's config.
 */
export const AaveETH: LendMarketConfig = {
  address: getAssetAddress(WETH, optimismSepolia.id),
  chainId: optimismSepolia.id,
  name: 'Aave ETH',
  asset: ETH,
  lendProvider: 'aave',
}

/**
 * @description Morpho Blue market on Base Sepolia used for borrow demos.
 * `marketId` is the keccak256 of `marketParams` (loanToken, collateralToken,
 * oracle, irm, lltv). Mirrored from `packages/demo/backend/src/config/markets.ts`
 * so the CLI operates against the same demo market the backend does. Collateral
 * is the Gauntlet USDC vault share (a Morpho vault token), and the borrow asset
 * is OP_DEMO; `lendProvider: 'morpho'` is informational so frontends can wire
 * the supply leg through the same protocol.
 */
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
    loanToken: '0xD6169405013E92387b78457Fa77d377cE8cD3EE8',
    collateralToken: '0x018e22BBC6eB3daCfd151d1Cc4Dc72f6337B3eA1',
    oracle: '0xB31E326bF4BdB5Ab98eF19C16dd420C8d6176e86',
    irm: '0x46415998764C29aB2a25CbeA6254146D50D22687',
    lltv: 860000000000000000n,
  },
}
