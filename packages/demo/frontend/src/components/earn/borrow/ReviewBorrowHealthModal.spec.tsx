import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OP_DEMO, USDC_DEMO } from '@eth-optimism/actions-sdk'
import { ReviewBorrowHealthModal } from './ReviewBorrowHealthModal'

function baseProps(
  overrides: Partial<Parameters<typeof ReviewBorrowHealthModal>[0]> = {},
) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isExecuting: false,
    flow: 'borrow' as const,
    amount: { main: '100', secondary: '00' },
    amountUsd: '$10.00',
    asset: OP_DEMO,
    currentLtv: 0,
    projectedLtv: 0,
    maxLtv: 0.86,
    bufferPct: 0.05,
    borrowApy: 0.058,
    collateralAsset: USDC_DEMO,
    collateralValueUsd: 1000,
    projectedHealthFactor: 5.0,
    wouldLiquidate: false,
    ...overrides,
  }
}

describe('ReviewBorrowHealthModal', () => {
  it('renders no warning when projection is safely below the danger threshold', () => {
    render(<ReviewBorrowHealthModal {...baseProps()} />)
    expect(screen.queryByText(/buffer zone/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/would liquidate/i)).not.toBeInTheDocument()
  })

  it('shows borrow warning copy when projected HF is between 1.0 and 1.2 (buffer-zone)', () => {
    render(
      <ReviewBorrowHealthModal
        {...baseProps({ projectedHealthFactor: 1.1, flow: 'borrow' })}
      />,
    )
    expect(
      screen.getByText(/leaves your position vulnerable to liquidation/i),
    ).toBeInTheDocument()
    // CTA must remain enabled for buffer-zone (informational gate).
    const cta = screen.getByRole('button', { name: /^Borrow$/i })
    expect(cta).not.toBeDisabled()
  })

  it('shows withdraw-specific copy when flow is withdraw and HF is danger', () => {
    render(
      <ReviewBorrowHealthModal
        {...baseProps({ projectedHealthFactor: 1.1, flow: 'withdraw' })}
      />,
    )
    expect(
      screen.getByText(/leaves your position vulnerable to liquidation/i),
    ).toBeInTheDocument()
  })

  it('shows liquidation-specific copy and disables Confirm when wouldLiquidate=true', () => {
    render(
      <ReviewBorrowHealthModal
        {...baseProps({
          projectedHealthFactor: 0.9,
          wouldLiquidate: true,
        })}
      />,
    )
    expect(
      screen.getByText(/would liquidate your position/i),
    ).toBeInTheDocument()
    const cta = screen.getByRole('button', { name: /^Borrow$/i })
    expect(cta).toBeDisabled()
  })

  it('hides the warning when projected HF is exactly the infinity sentinel', () => {
    render(
      <ReviewBorrowHealthModal
        {...baseProps({ projectedHealthFactor: Number.POSITIVE_INFINITY })}
      />,
    )
    expect(screen.queryByText(/buffer zone/i)).not.toBeInTheDocument()
  })

  it('disables the CTA while isExecuting is true', () => {
    render(<ReviewBorrowHealthModal {...baseProps({ isExecuting: true })} />)
    expect(screen.getByRole('button', { name: /Submitting/i })).toBeDisabled()
  })

  it('fires onConfirm when the CTA is clicked in a safe state', () => {
    const onConfirm = vi.fn()
    render(<ReviewBorrowHealthModal {...baseProps({ onConfirm })} />)
    fireEvent.click(screen.getByRole('button', { name: /^Borrow$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
