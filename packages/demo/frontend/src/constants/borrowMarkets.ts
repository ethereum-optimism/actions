/**
 * Hardcoded borrow markets for the demo frontend stub.
 *
 * PR #2 deployed one Morpho Blue market on Base Sepolia: dUSDC collateral,
 * OP loan, LLTV 86%. PR #5 stubs that market here so the frontend has
 * something to render before PR #4 wires the backend. When PR #4 lands,
 * the stub's `borrowApi.getMarkets()` swaps to a real fetch and this
 * constant is no longer the source of truth; until then the stub returns
 * this array verbatim.
 *
 * The `marketId.marketId` (bytes32) is a placeholder value. PR #2's deploy
 * script computes the real marketId from `keccak256(abi.encode(marketParams))`
 * at deploy time and writes it to `deployments.json`. The frontend doesn't
 * verify the bytes32 against on-chain state, so any consistent value is
 * fine for the stub.
 */
import { OP_DEMO, USDC_DEMO } from '@eth-optimism/actions-sdk/react'
import { baseSepolia } from 'viem/chains'
import type { BorrowMarket } from '@/types/borrow'

export const MORPHO_USDC_OP_BASE_SEPOLIA: BorrowMarket = {
  marketId: {
    kind: 'morpho-blue',
    marketId:
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    chainId: baseSepolia.id,
  },
  name: 'Morpho OP / USDC',
  collateralAsset: USDC_DEMO,
  borrowAsset: OP_DEMO,
  liquidity: {
    // 100k OP seeded by deploy-demo.sh; OP has 18 decimals.
    amount: 100_000n * 10n ** 18n,
    amountFormatted: '100000',
  },
  // 5.8% APY mirrors the screenshot value.
  borrowApy: 0.058,
  // 86% LLTV matches PR #2's market params.
  maxLtv: 0.86,
  // 5% liquidator discount, conventional default.
  liquidationBonus: 0.05,
  borrowProvider: 'morpho',
  lendProvider: 'morpho',
}

export const ALL_BORROW_MARKETS: readonly BorrowMarket[] = [
  MORPHO_USDC_OP_BASE_SEPOLIA,
]
