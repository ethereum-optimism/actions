import { describe, expect, it } from 'vitest'
import type { MarketInfo } from '@/components/earn/MarketSelector'
import {
  buildBorrowMarketPosition,
  buildMarketPosition,
  usdcAsset,
} from '@/test-utils/borrowFixtures'
import { buildEffectiveLendPositions } from './effectiveLendPositions'

const market: MarketInfo = {
  name: 'Gauntlet USDC',
  logo: 'market.svg',
  networkName: 'Base Sepolia',
  networkLogo: 'base.svg',
  asset: usdcAsset,
  assetLogo: 'usdc.svg',
  apy: 0.04,
  isLoadingApy: false,
  marketId: { address: '0xvault', chainId: 84532 },
  provider: 'morpho',
}

const directPosition = buildMarketPosition({
  marketName: market.name,
  marketLogo: market.logo,
  networkName: market.networkName,
  networkLogo: market.networkLogo,
  assetLogo: market.assetLogo,
  apy: market.apy,
  depositedAmount: '25.00',
  directDepositedAmount: '25.00',
  depositedShares: '25.00',
  depositedSharesRaw: 25n,
  directDepositedShares: '25.00',
  directDepositedSharesRaw: 25n,
  marketId: market.marketId,
  provider: market.provider,
})

const pledgedPosition = buildBorrowMarketPosition({
  marketId: { kind: 'morpho-blue', marketId: '0xborrow', chainId: 84532 },
  collateralShares: 75n,
  collateralAmount: 75_000000n,
  collateralAmountFormatted: '75',
  borrowAsset: {
    metadata: { symbol: 'OP_DEMO', name: 'Demo OP', decimals: 18 },
    type: 'erc20',
    address: { 84532: '0x2' },
  },
  borrowAmount: 10n,
  borrowAmountFormatted: '10',
  healthFactor: 2,
  borrowApy: 0.03,
  liquidationBonus: 0.05,
  ltv: 0.1,
})

describe('buildEffectiveLendPositions', () => {
  it('adds pledged collateral to the displayed lend balance', () => {
    const [position] = buildEffectiveLendPositions(
      [market],
      [directPosition],
      [pledgedPosition],
    )
    expect(position.depositedAmount).toBe('100.00')
    expect(position.directDepositedAmount).toBe('25.00')
    expect(position.pledgedCollateralAmount).toBe('75')
  })

  it('floors the displayed deposit so it never exceeds the pledged collateral', () => {
    const [position] = buildEffectiveLendPositions(
      [market],
      [],
      [buildBorrowMarketPosition({ collateralAmountFormatted: '40.0172' })],
    )
    // Must floor to 40.01, not round up to 40.02 (rounding up would let withdraw Max exceed actual collateral).
    expect(position.depositedAmount).toBe('40.01')
  })

  it('synthesizes a lend row when all collateral is pledged', () => {
    const [position] = buildEffectiveLendPositions(
      [market],
      [],
      [pledgedPosition],
    )
    expect(position.depositedAmount).toBe('75.00')
    expect(position.directDepositedAmount).toBeNull()
  })

  it('does not double-count Aave collateral (lend deposit is the same aToken)', () => {
    const ethAsset = {
      type: 'native' as const,
      address: { 11155420: '0x4200000000000000000000000000000000000006' },
      metadata: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    }
    const aaveMarket: MarketInfo = {
      ...market,
      name: 'Aave ETH',
      asset: ethAsset,
      marketId: { address: '0xweth', chainId: 11155420 },
      provider: 'aave',
    }
    const aaveLend = buildMarketPosition({
      asset: ethAsset,
      depositedAmount: '0.02',
      directDepositedAmount: '0.02',
      marketId: aaveMarket.marketId,
      provider: 'aave',
    })
    // Aave borrow reports the same ETH aToken balance as collateral (must not be double-counted).
    const aaveBorrow = buildBorrowMarketPosition({
      marketId: { kind: 'aave-v3', marketId: '0xaave', chainId: 11155420 },
      collateralAsset: ethAsset,
      collateralAmountFormatted: '0.02',
      borrowAmountFormatted: '14',
      borrowAmount: 14_000000n,
    })
    const [position] = buildEffectiveLendPositions(
      [aaveMarket],
      [aaveLend],
      [aaveBorrow],
    )
    expect(position.depositedAmount).toBe('0.02')
    expect(position.pledgedCollateralAmount).toBeNull()
  })
})
