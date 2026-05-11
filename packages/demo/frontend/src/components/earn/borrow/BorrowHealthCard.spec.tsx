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
  safeCeilingLtv: 0.817, // 0.86 * 0.95
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

  it('renders projection arrow when projected differs from current', () => {
    render(
      <BorrowHealthCard
        {...baseProps}
        currentLtv={0.3}
        projectedLtv={0.5}
        projectedHealthFactor={1.7}
      />,
    )
    // Both numeric values appear in the projection reading.
    expect(screen.getByText(/36\.7%/)).toBeInTheDocument() // 0.3/0.817 ~= 36.7%
    expect(screen.getByText(/61\.2%/)).toBeInTheDocument() // 0.5/0.817 ~= 61.2%
  })

  it('surfaces buffer-zone warning when projected exceeds safe ceiling', () => {
    render(
      <BorrowHealthCard
        {...baseProps}
        currentLtv={0.3}
        projectedLtv={0.85} // > safe ceiling 0.817 but < maxLtv 0.86
        projectedHealthFactor={1.01}
      />,
    )
    expect(
      screen.getByText(/Position is in the buffer zone/i),
    ).toBeInTheDocument()
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
