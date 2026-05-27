import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import type {
  Asset,
  BorrowMarket,
  BorrowMarketPosition,
  SupportedChainId,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { Action } from './Action'
import { BorrowProviderContext } from '@/contexts/BorrowProviderContext'
import type { UseBorrowProviderReturn } from '@/hooks/useBorrowProvider'

// Mock dependencies
vi.mock('../../contexts/ActivityHighlightContext', () => ({
  useActivityHighlight: () => ({ hoveredAction: null }),
}))

vi.mock('@/utils/analytics', () => ({
  trackEvent: vi.fn(),
}))

const CHAIN_ID = 84532 as SupportedChainId
const USDC_ADDRESS = '0xa0b86a33e6427e8e7c3e8a8b3a8e3b6a0b86a33e' as Address
const BORROW_ASSET_ADDRESS =
  '0x4200000000000000000000000000000000000042' as Address
const MARKET_ID =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as Address

const usdcAsset: Asset = {
  type: 'erc20',
  address: { [CHAIN_ID]: USDC_ADDRESS },
  metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
}

const opAsset: Asset = {
  type: 'erc20',
  address: { [CHAIN_ID]: BORROW_ASSET_ADDRESS },
  metadata: { decimals: 18, name: 'Optimism', symbol: 'OP' },
}

const borrowMarketId = {
  kind: 'morpho-blue' as const,
  marketId: MARKET_ID,
  chainId: CHAIN_ID,
}

function pledgedPosition(): BorrowMarketPosition {
  return {
    marketId: borrowMarketId,
    collateralAsset: usdcAsset,
    borrowAsset: opAsset,
    collateralAmount: 100_000_000n,
    collateralAmountFormatted: '100',
    collateralShares: 100_000_000n,
    collateralSharesFormatted: '100',
    borrowAmount: 100_000_000_000_000_000_000n,
    borrowAmountFormatted: '100',
    healthFactor: 8.6,
    liquidationPrice: 0n,
    borrowApy: 0.05,
    liquidationBonus: 0.05,
    ltv: 0.1,
    maxLtv: 0.86,
  } as BorrowMarketPosition
}

function borrowMarketFixture(): BorrowMarket {
  return {
    marketId: borrowMarketId,
    name: 'Demo Borrow',
    collateralAsset: usdcAsset,
    borrowAsset: opAsset,
    maxLtv: 0.86,
    healthBufferPct: 0.05,
    borrowApy: 0.05,
    liquidationBonus: 0.05,
    totalBorrowed: 0n,
    totalCollateral: 0n,
    liquidity: 0n,
  } as BorrowMarket
}

function withBorrowCtx(
  positions: readonly BorrowMarketPosition[],
  markets: readonly BorrowMarket[] = [borrowMarketFixture()],
) {
  const ctx = {
    borrowPositions: positions,
    isInitialLoad: false,
    markets,
  } as unknown as UseBorrowProviderReturn
  return ({ children }: { children: ReactNode }) =>
    createElement(
      BorrowProviderContext.Provider,
      { value: ctx },
      children as ReactNode,
    )
}

const defaultProps = {
  assetBalance: '0',
  isLoadingBalance: false,
  isMintingAsset: false,
  depositedAmount: null,
  assetSymbol: 'USDC',
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

  it('shows shimmer instead of Get button while balance is loading', () => {
    render(<Action {...defaultProps} isLoadingBalance={true} />)
    expect(screen.getByTestId('shimmer')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Get USDC' }),
    ).not.toBeInTheDocument()
  })

  it('shows balance and Lend button when balance is non-zero', () => {
    render(<Action {...defaultProps} assetBalance="100.00" />)
    expect(screen.getByText('100.00 USDC')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Lend USDC' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Get USDC' }),
    ).not.toBeInTheDocument()
  })

  it('shows BorrowHealthCard in withdraw mode when the lend asset secures a borrow', () => {
    const onTransaction = vi.fn()
    render(
      <Action
        {...defaultProps}
        assetBalance="100.00"
        depositedAmount="100.00"
        directDepositedAmount="0.00"
        asset={usdcAsset}
        onTransaction={onTransaction}
      />,
      { wrapper: withBorrowCtx([pledgedPosition()]) },
    )
    // Switch to Withdraw mode
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    // Health card is present (uses the "Health" header label)
    expect(screen.getByText(/^Health$/i)).toBeInTheDocument()
    // Liquidation row is present at the configured maxLtv
    expect(screen.getByText('Liquidation at')).toBeInTheDocument()
  })

  it('disables the withdraw CTA when the projected withdraw would liquidate', () => {
    render(
      <Action
        {...defaultProps}
        assetBalance="100.00"
        depositedAmount="100.00"
        directDepositedAmount="0.00"
        asset={usdcAsset}
      />,
      { wrapper: withBorrowCtx([pledgedPosition()]) },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    // Withdraw the full pledged collateral to drive HF below 1.0
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '100' } })
    const cta = screen.getByRole('button', { name: /Withdraw USDC/i })
    expect(cta).toBeDisabled()
  })

  it('switches between Lend and Withdraw mode via ModeToggle', () => {
    render(
      <Action
        {...defaultProps}
        assetBalance="100.00"
        depositedAmount="50.00"
      />,
    )
    // Default mode is 'lend'
    expect(
      screen.getByRole('button', { name: 'Lend USDC' }),
    ).toBeInTheDocument()

    // ModeToggle exposes both toggle buttons; clicking 'Withdraw' switches mode
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    expect(
      screen.getByRole('button', { name: 'Withdraw USDC' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Lend USDC' }),
    ).not.toBeInTheDocument()

    // Clicking 'Lend' switches back
    fireEvent.click(screen.getByRole('button', { name: 'Lend' }))
    expect(
      screen.getByRole('button', { name: 'Lend USDC' }),
    ).toBeInTheDocument()
  })
})
