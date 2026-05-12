/**
 * Hardcoded borrow markets for the demo frontend stub.
 *
 * PR #2 deployed one Morpho Blue market on Base Sepolia: dUSDC collateral,
 * OP loan, LLTV 86%. PR #5 stubs that market here so the frontend has
 * something to render while real backend wiring (PR #4) is plumbed.
 * When the stub `borrowApi.ts` is swapped for HTTP fetches against the
 * real `/borrow/*` endpoints, this constant is no longer the source of
 * truth.
 *
 * The `marketId.marketId` (bytes32) is a placeholder value. PR #2's deploy
 * script computes the real marketId at deploy time and writes it to
 * `deployments.json`. The frontend doesn't verify the bytes32 against
 * on-chain state, so any consistent value is fine for the stub.
 */
import { OP_DEMO, USDC_DEMO } from '@eth-optimism/actions-sdk'
import type { BorrowMarket } from '@eth-optimism/actions-sdk'
import { baseSepolia } from 'viem/chains'

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
  // 5.8% APY mirrors the screenshot value.
  borrowApy: 0.058,
  // 5% liquidator discount, conventional default.
  liquidationBonus: 0.05,
  // 86% LLTV matches PR #2's market params.
  maxLtv: 0.86,
  // 100k OP seeded by deploy-demo.sh; OP has 18 decimals. Initially all
  // available, none borrowed.
  totalBorrowed: 0n,
  totalCollateral: 100_000n * 10n ** 18n,
}

export const ALL_BORROW_MARKETS: readonly BorrowMarket[] = [
  MORPHO_USDC_OP_BASE_SEPOLIA,
]
