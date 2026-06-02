import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LentBalance from './LentBalance'
import { buildMarketPosition as buildPosition } from '@/test-utils/borrowFixtures'

vi.mock('../../contexts/ActivityHighlightContext', () => ({
  useActivityHighlight: () => ({ hoveredAction: null }),
}))

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
