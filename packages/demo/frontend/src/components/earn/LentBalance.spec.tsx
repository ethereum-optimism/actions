import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LentBalance from './LentBalance'
import type { MarketPosition } from '@/types/market'

vi.mock('../../contexts/ActivityHighlightContext', () => ({
  useActivityHighlight: () => ({ hoveredAction: null }),
}))

function buildPosition(
  overrides: Partial<MarketPosition> = {},
): MarketPosition {
  return {
    marketName: 'Gauntlet USDC',
    marketLogo: 'https://example.test/gauntlet.svg',
    networkName: 'Base Sepolia',
    networkLogo: 'https://example.test/base.svg',
    // @ts-expect-error - simplified Asset for test fixtures
    asset: {
      metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      type: 'erc20',
      address: { 84532: '0x0000000000000000000000000000000000000001' },
    },
    assetLogo: 'https://example.test/usdc.svg',
    apy: 0.045,
    depositedAmount: '100.00',
    isLoadingApy: false,
    isLoadingPosition: false,
    marketId: {
      address: '0x0000000000000000000000000000000000000001',
      chainId: 84532,
    },
    provider: 'morpho',
    ...overrides,
  }
}

describe('LentBalance', () => {
  it('renders the empty-state copy when no positions have deposits', () => {
    render(<LentBalance marketPositions={[]} isInitialLoad={false} />)
    expect(screen.getByText(/No active markets yet/i)).toBeInTheDocument()
  })

  it('renders shimmer placeholders while initial load is in progress', () => {
    render(<LentBalance marketPositions={[]} isInitialLoad={true} />)
    expect(screen.queryByText(/No active markets yet/i)).not.toBeInTheDocument()
  })

  it('renders a market row when a position has a non-zero deposit', () => {
    const positions = [buildPosition({ depositedAmount: '250.00' })]
    render(
      <LentBalance
        marketPositions={positions}
        isInitialLoad={false}
        getInterest={() => 0}
      />,
    )
    // Asset symbol appears in the row (desktop layout + mobile layout)
    const usdcCells = screen.getAllByText('USDC')
    expect(usdcCells.length).toBeGreaterThan(0)
    // Market name appears
    expect(screen.getAllByText('Gauntlet USDC').length).toBeGreaterThan(0)
    // APY rendering
    expect(screen.getAllByText('4.50%').length).toBeGreaterThan(0)
  })

  it('filters out positions with zero deposit', () => {
    const positions = [
      buildPosition({ depositedAmount: '0' }),
      buildPosition({ depositedAmount: '0.00' }),
    ]
    render(<LentBalance marketPositions={positions} isInitialLoad={false} />)
    expect(screen.getByText(/No active markets yet/i)).toBeInTheDocument()
  })
})
