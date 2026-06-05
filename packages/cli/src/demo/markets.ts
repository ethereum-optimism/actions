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
 * @description Real Aave V3 borrow market on Optimism Sepolia: real ETH
 * collateral, real USDC debt. Synthetic `marketId` derived from the
 * (chain, WETH, USDC) triple since Aave has no params-hash market id.
 * Mirrored from `packages/demo/backend/src/config/markets.ts`. The CLI uses
 * the SDK provider directly, so there is no USDC_DEMO mirror here (that lives
 * only in the demo backend); the CLI borrows real USDC on OP Sepolia.
 */
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

/**
 * @description Morpho Blue market on Base Sepolia used for borrow demos.
 * `marketId` is the keccak256 of `marketParams` (loanToken, collateralToken,
 * oracle, irm, lltv). Mirrored from `packages/demo/backend/src/config/markets.ts`
 * so the CLI operates against the same demo market the backend does. Collateral
 * is the Gauntlet USDC vault share (a Morpho vault token), and the borrow asset
 * is OP_DEMO; `lendProvider: 'morpho'` is informational so frontends can wire
 * the supply leg through the same protocol.
 */
export const MorphoUSDCBorrowDemo: BorrowMarketConfig = {
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
