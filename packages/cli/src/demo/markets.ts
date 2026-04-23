import {
  ETH,
  type LendMarketConfig,
  USDC_DEMO,
  WETH,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
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
  address: WETH.address[optimismSepolia.id] as Address,
  chainId: optimismSepolia.id,
  name: 'Aave ETH',
  asset: ETH,
  lendProvider: 'aave',
}
