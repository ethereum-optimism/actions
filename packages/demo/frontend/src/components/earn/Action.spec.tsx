import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Action } from './Action'

// Mock dependencies
vi.mock('../../contexts/ActivityHighlightContext', () => ({
  useActivityHighlight: () => ({ hoveredAction: null }),
}))

vi.mock('@/utils/analytics', () => ({
  trackEvent: vi.fn(),
}))

const defaultProps = {
  assetBalance: '0',
  isLoadingBalance: false,
  isMintingAsset: false,
  depositedAmount: null,
  assetSymbol: 'USDC',
  assetLogo: '/usdc-logo.svg',
  onMintAsset: vi.fn(),
  onTransaction: vi.fn(),
}

describe('Action', () => {
  it('shows Get button when balance is zero and not minting', () => {
    render(<Action {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Get USDC' })).toBeInTheDocument()
  })

  it('shows Minting... text and disables button when minting', () => {
    render(<Action {...defaultProps} isMintingAsset={true} />)
    const button = screen.getByRole('button', { name: 'Minting...' })
    expect(button).toBeInTheDocument()
    expect(button).toBeDisabled()
  })

  it('shows button instead of shimmer when minting even if loading', () => {
    render(
      <Action
        {...defaultProps}
        isLoadingBalance={true}
        isMintingAsset={true}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Minting...' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('shimmer')).not.toBeInTheDocument()
  })

  it('shows balance when balance is non-zero', () => {
    render(<Action {...defaultProps} assetBalance="100.00" />)
    expect(screen.getByText('$100.00')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Get USDC' }),
    ).not.toBeInTheDocument()
  })
})
