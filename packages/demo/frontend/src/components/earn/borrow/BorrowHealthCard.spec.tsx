import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BorrowHealthCard } from './BorrowHealthCard'
import { USDC_DEMO } from '@eth-optimism/actions-sdk'

const baseProps = {
  collateralAsset: USDC_DEMO,
  bufferPct: 0.05,
  borrowApy: 0.058,
  collateralValueUsd: 1000,
  maxLtv: 0.86,
}

describe('BorrowHealthCard', () => {
  it('renders zero-debt baseline with no projection', () => {
    render(
      <BorrowHealthCard
        {...baseProps}
        currentLtv={0}
        projectedLtv={0}
        projectedHealthFactor={Number.POSITIVE_INFINITY}
      />,
    )
    expect(screen.getByText(/Health/i)).toBeInTheDocument()
    expect(screen.getByText('Liquidation at')).toBeInTheDocument()
    expect(screen.getByText('86.0%')).toBeInTheDocument()
    expect(screen.getByText('Buffer')).toBeInTheDocument()
    expect(screen.getByText('5%')).toBeInTheDocument()
  })

  it('shows the canonical Aave-style HF when projected health is finite', () => {
    render(
      <BorrowHealthCard
        {...baseProps}
        currentLtv={0.4}
        projectedLtv={0.4}
        projectedHealthFactor={2.15}
      />,
    )
    expect(screen.getByText(/Health Factor: 2\.15/)).toBeInTheDocument()
  })

  it('renders projection arrow with raw LTV percentages', () => {
    render(
      <BorrowHealthCard
        {...baseProps}
        currentLtv={0.3}
        projectedLtv={0.5}
        projectedHealthFactor={1.7}
      />,
    )
    // Numeric reading shows raw LTV (not the bar fill).
    // 0.3 = 30.0%, 0.5 = 50.0%
    expect(screen.getByText(/30\.0%/)).toBeInTheDocument()
    expect(screen.getByText(/50\.0%/)).toBeInTheDocument()
  })

  it('shows projection at maxLtv when at liquidation threshold', () => {
    // currentLtv 0.4 → 40%; projectedLtv at maxLtv = 86%
    render(
      <BorrowHealthCard
        {...baseProps}
        currentLtv={0.4}
        projectedLtv={0.86}
        projectedHealthFactor={1.0}
      />,
    )
    // 0.86 = 86.0% — same value as "Liquidation at 86.0%" stat row
    expect(screen.getAllByText(/86\.0%/).length).toBeGreaterThan(0)
  })

  it('renders "Would liquidate" state when wouldLiquidate=true', () => {
    render(
      <BorrowHealthCard
        {...baseProps}
        currentLtv={0.3}
        projectedLtv={0.3}
        projectedHealthFactor={Number.POSITIVE_INFINITY}
        wouldLiquidate
      />,
    )
    expect(screen.getByText(/Would liquidate/i)).toBeInTheDocument()
  })
})
