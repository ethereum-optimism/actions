import {
  type BorrowMarketConfig,
  computeAaveBorrowMarketId,
  ETH,
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
  address: WETH.address[optimismSepolia.id] as Address,
  chainId: optimismSepolia.id,
  name: 'Aave ETH',
  asset: ETH,
  lendProvider: 'aave',
}

// Real Aave V3 borrow market on Optimism Sepolia: real ETH collateral, real
// USDC debt. The Aave OP Sepolia pool has only USDC and WETH reserves, so USDC
// is the sole borrowable asset. Synthetic `marketId` derived from the
// (chain, WETH, USDC) triple. Mirrors the backend's `AaveUSDCBorrowDemo`; the
// frontend-wallet path borrows real USDC directly via the SDK (no USDC_DEMO
// mirror, which is backend-only).
const AAVE_OP_SEPOLIA_WETH = WETH.address[optimismSepolia.id] as Address
const AAVE_OP_SEPOLIA_USDC = USDC.address[optimismSepolia.id] as Address

export const AaveBorrowDemo: BorrowMarketConfig = {
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

/**
 * The Morpho borrow market whose collateral is the given lend vault, matched by
 * the vault address (the market's `collateralToken`). Lets the lend flow pledge
 * freshly-minted vault shares as borrow collateral so collateral tracks the
 * lend position. Returns undefined for non-Morpho lends (e.g. Aave, which
 * supplies collateral at lend time and needs no chaining).
 */
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
