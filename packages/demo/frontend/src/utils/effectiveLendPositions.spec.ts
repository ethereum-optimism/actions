import { describe, expect, it } from 'vitest'
import type { MarketInfo } from '@/components/earn/MarketSelector'
import type { MarketPosition } from '@/types/market'
import { buildBorrowMarketPosition } from '@/test-utils/borrowFixtures'
import { buildEffectiveLendPositions } from './effectiveLendPositions'

const market: MarketInfo = {
  name: 'Gauntlet USDC',
  logo: 'market.svg',
  networkName: 'Base Sepolia',
  networkLogo: 'base.svg',
  // @ts-expect-error test fixture
  asset: {
    metadata: { symbol: 'USDC_DEMO', name: 'Demo USDC', decimals: 6 },
    type: 'erc20',
    address: { 84532: '0x1' },
  },
  assetLogo: 'usdc.svg',
  apy: 0.04,
  isLoadingApy: false,
  marketId: { address: '0xvault', chainId: 84532 },
  provider: 'morpho',
}

const directPosition: MarketPosition = {
  marketName: market.name,
  marketLogo: market.logo,
  networkName: market.networkName,
  networkLogo: market.networkLogo,
  asset: market.asset,
  assetLogo: market.assetLogo,
  apy: market.apy,
  depositedAmount: '25.00',
  directDepositedAmount: '25.00',
  depositedShares: '25.00',
  depositedSharesRaw: 25n,
  directDepositedShares: '25.00',
  directDepositedSharesRaw: 25n,
  pledgedCollateralAmount: null,
  isLoadingApy: false,
  isLoadingPosition: false,
  marketId: market.marketId,
  provider: market.provider,
}

const pledgedPosition = buildBorrowMarketPosition({
  marketId: { kind: 'morpho-blue', marketId: '0xborrow', chainId: 84532 },
  collateralAsset: market.asset,
  collateralShares: 75n,
  collateralSharesFormatted: '75',
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

  it('synthesizes a lend row when all collateral is pledged', () => {
    const [position] = buildEffectiveLendPositions(
      [market],
      [],
      [pledgedPosition],
    )
    expect(position.depositedAmount).toBe('75.00')
    expect(position.directDepositedAmount).toBeNull()
  })
})
