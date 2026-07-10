import { fireEvent, render, screen } from '@testing-library/react'
import type {
  Asset,
  BorrowMarket,
  SupportedChainId,
} from '@eth-optimism/actions-sdk'
import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AaveETHBorrowUSDCDemo } from '@/constants/markets'
import {
  buildBorrowMarketPosition,
  makeBorrowContextWrapper,
} from '@/test-utils/borrowFixtures'
import type { BorrowPosition, MarketPosition } from '@/types/market'
import type { UseBorrowProviderReturn } from '@/hooks/useBorrowProvider'
import { BorrowAction } from './BorrowAction'

const { txState, projectionSpy } = vi.hoisted(() => ({
  txState: { isExecuting: false },
  projectionSpy: vi.fn(),
}))

// Stub transaction/projection hooks so tests exercise market selection and repay gating only.
vi.mock('@/hooks/useBorrowTransaction', () => ({
  useBorrowTransaction: () => ({
    isExecuting: txState.isExecuting,
    runTransaction: vi.fn(),
    txModal: { isOpen: false, status: 'loading', onClose: vi.fn() },
    toast: { visible: false, title: '', description: '', onClose: vi.fn() },
  }),
}))
vi.mock('@/hooks/useBorrowQuotePreview', () => ({
  useBorrowQuotePreview: () => ({ livePreview: null, isPreviewLoading: false }),
}))
vi.mock('@/hooks/useBorrowProjection', () => ({
  useBorrowProjection: (args: { amountNum: number }) => {
    projectionSpy(args)
    return {
      currentLtv: 0,
      projectedLtv: 0,
      wouldLiquidate: false,
      projectedHealthFactor: Number.POSITIVE_INFINITY,
    }
  },
}))

beforeEach(() => {
  txState.isExecuting = false
  projectionSpy.mockClear()
})

const OPS = 11155420 as SupportedChainId
const ETH: Asset = {
  type: 'native',
  address: { [OPS]: '0x4200000000000000000000000000000000000006' },
  metadata: { decimals: 18, name: 'Ether', symbol: 'ETH' },
}
const USDC: Asset = {
  type: 'erc20',
  address: { [OPS]: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' },
  metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
}
const USDC_DEMO: Asset = {
  type: 'erc20',
  address: { 84532: '0xb1b0FE886cE376F28987Ad24b1759a8f0A7dd839' },
  metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC_DEMO' },
}
const OP: Asset = {
  type: 'erc20',
  address: { 84532: '0xD6169405013E92387b78457Fa77d377cE8cD3EE8' },
  metadata: { decimals: 18, name: 'Optimism', symbol: 'OP_DEMO' },
}

const morphoMarket = {
  marketId: {
    kind: 'morpho-blue',
    marketId: '0x' + 'a'.repeat(64),
    chainId: 84532,
  },
  name: 'Demo dUSDC / OP',
  collateralAsset: USDC_DEMO,
  borrowAsset: OP,
  borrowApy: 0.01,
  liquidationBonus: 0.04,
  maxLtv: 0.86,
  healthBufferPct: 0.05,
  totalBorrowed: 0n,
  totalCollateral: 0n,
} as unknown as BorrowMarket

const aaveMarket = {
  // Real mirror-market id so isMirrorMarket matches and repay gates on USDC_DEMO.
  marketId: {
    kind: AaveETHBorrowUSDCDemo.kind,
    marketId: AaveETHBorrowUSDCDemo.marketId,
    chainId: AaveETHBorrowUSDCDemo.chainId,
  },
  name: 'Aave ETH / USDC',
  collateralAsset: ETH,
  borrowAsset: USDC,
  borrowApy: 0.0038,
  liquidationBonus: 0.05,
  maxLtv: 0.86,
  healthBufferPct: 0.05,
  totalBorrowed: 0n,
  totalCollateral: 0n,
} as unknown as BorrowMarket

const ethLendPosition = {
  asset: ETH,
  assetLogo: 'eth.svg',
  depositedAmount: '0.01',
  directDepositedAmount: '0.01',
  depositedSharesRaw: null,
  directDepositedSharesRaw: null,
  marketId: { address: ETH.address[OPS], chainId: OPS },
  provider: 'aave',
} as unknown as MarketPosition

function ctx(
  selectedMarket: BorrowMarket,
  overrides: Partial<UseBorrowProviderReturn> = {},
): UseBorrowProviderReturn {
  return {
    markets: [morphoMarket, aaveMarket],
    selectedMarket,
    borrowPositions: [],
    tokenBalances: [],
    handleMarketSelect: vi.fn(),
    handleTransaction: vi.fn(),
    getQuote: vi.fn(),
    ...overrides,
  } as unknown as UseBorrowProviderReturn
}

// An open Aave position: 100 USDC of debt against the ETH collateral.
const aaveDebtPosition = buildBorrowMarketPosition({
  marketId: aaveMarket.marketId,
  collateralAsset: ETH,
  borrowAsset: USDC,
  borrowAmount: 100_000_000n,
  borrowAmountFormatted: '100',
  healthFactor: 1.5,
}) as BorrowPosition

// Repay gate reads USDC_DEMO balance (the mirror asset), not the borrowed USDC.
function usdcDemoBalance(amount: number): TokenBalance {
  const raw = BigInt(Math.round(amount * 1e6))
  return {
    asset: USDC_DEMO,
    totalBalance: amount,
    totalBalanceRaw: raw,
    chains: { [OPS]: { balance: amount, balanceRaw: raw } },
  } as unknown as TokenBalance
}

describe('BorrowAction market binding', () => {
  it('borrows USDC against an ETH lend position even when the global default is the Morpho (OP) market', () => {
    render(<BorrowAction selectedLendPosition={ethLendPosition} />, {
      // Global default is Morpho (m[0]); ETH collateral must still bind to the Aave market.
      wrapper: makeBorrowContextWrapper(ctx(morphoMarket)),
    })
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.queryByText('OP')).not.toBeInTheDocument()
  })
})

describe('BorrowAction repay gating on debt-asset balance', () => {
  function renderRepay(overrides: Partial<UseBorrowProviderReturn>) {
    render(<BorrowAction selectedLendPosition={ethLendPosition} />, {
      wrapper: makeBorrowContextWrapper(ctx(aaveMarket, overrides)),
    })
    fireEvent.click(screen.getByText('Repay'))
  }

  // Both the mode toggle and CTA read "Repay"; target the last button in DOM order.
  const repayCta = () => {
    const buttons = screen.getAllByRole('button', { name: 'Repay' })
    return buttons[buttons.length - 1]
  }

  it('blocks repay when the USDC balance lives only on the non-borrow chain', () => {
    const raw = 50_000000n
    const crossChainOnly = {
      asset: USDC_DEMO,
      totalBalance: 50,
      totalBalanceRaw: raw,
      chains: { 84532: { balance: 50, balanceRaw: raw } },
    } as unknown as TokenBalance
    renderRepay({
      borrowPositions: [aaveDebtPosition],
      tokenBalances: [crossChainOnly],
    })
    expect(
      screen.getByText(/need USDC to repay this loan/i),
    ).toBeInTheDocument()
    expect(repayCta()).toBeDisabled()
  })

  it('blocks repay with a re-acquire notice when the USDC balance is zero', () => {
    renderRepay({
      borrowPositions: [aaveDebtPosition],
      tokenBalances: [usdcDemoBalance(0)],
    })
    expect(
      screen.getByText(/need USDC to repay this loan/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /get USDC/i }),
    ).toBeInTheDocument()
    expect(repayCta()).toBeDisabled()
  })

  it('allows partial repay and prompts to acquire more when balance is below the debt', () => {
    renderRepay({
      borrowPositions: [aaveDebtPosition],
      tokenBalances: [usdcDemoBalance(40)],
    })
    expect(screen.getByText(/repay up to 40 USDC/i)).toBeInTheDocument()
    // Max prefills the held balance (the cap), not the full 100 debt.
    fireEvent.click(screen.getByRole('button', { name: /^max$/i }))
    expect(screen.getByPlaceholderText('0')).toHaveValue('40')
    expect(repayCta()).not.toBeDisabled()
  })

  it('clamps an over-balance repay entry to the held balance', () => {
    renderRepay({
      borrowPositions: [aaveDebtPosition],
      tokenBalances: [usdcDemoBalance(40)],
    })
    fireEvent.change(screen.getByPlaceholderText('0'), {
      target: { value: '75' },
    })
    expect(screen.getByPlaceholderText('0')).toHaveValue('40')
  })

  it('shows no re-acquire notice when the balance covers the full debt', () => {
    renderRepay({
      borrowPositions: [aaveDebtPosition],
      tokenBalances: [usdcDemoBalance(150)],
    })
    expect(screen.queryByText(/repay this loan/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /get USDC/i })).toBeNull()
  })

  it('disables Repay and shows no notice once the loan is fully repaid', () => {
    const repaid = buildBorrowMarketPosition({
      marketId: aaveMarket.marketId,
      collateralAsset: ETH,
      borrowAsset: USDC,
      borrowAmount: 0n,
      borrowAmountFormatted: '0',
    }) as BorrowPosition
    renderRepay({
      borrowPositions: [repaid],
      tokenBalances: [usdcDemoBalance(50)],
    })
    expect(screen.queryByText(/repay this loan/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/repay up to/i)).not.toBeInTheDocument()
    expect(repayCta()).toBeDisabled()
  })

  it('shows no notice when the balance is within tolerance of the debt (interest dust)', () => {
    // Debt 100, holding 99.8 (within 0.5%), so effectively repayable in full.
    renderRepay({
      borrowPositions: [aaveDebtPosition],
      tokenBalances: [usdcDemoBalance(99.8)],
    })
    expect(screen.queryByText(/repay up to/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /get USDC/i })).toBeNull()
  })
})

describe('BorrowAction health projection during execution', () => {
  const lastProjectionAmount = () => {
    const calls = projectionSpy.mock.calls
    return calls[calls.length - 1]?.[0]?.amountNum
  }

  it('projects the typed borrow amount when idle', () => {
    render(<BorrowAction selectedLendPosition={ethLendPosition} />, {
      wrapper: makeBorrowContextWrapper(ctx(aaveMarket)),
    })
    fireEvent.change(screen.getByPlaceholderText('0'), {
      target: { value: '5' },
    })
    expect(lastProjectionAmount()).toBe(5)
  })

  it('zeroes the projected borrow amount while executing so the bar cannot overshoot', () => {
    txState.isExecuting = true
    render(<BorrowAction selectedLendPosition={ethLendPosition} />, {
      wrapper: makeBorrowContextWrapper(ctx(aaveMarket)),
    })
    fireEvent.change(screen.getByPlaceholderText('0'), {
      target: { value: '5' },
    })
    expect(lastProjectionAmount()).toBe(0)
  })
})

describe('BorrowAction Aave collateral (no double-count)', () => {
  it('uses the lend position as collateral, not lend + position collateral', () => {
    const lend = {
      ...ethLendPosition,
      depositedAmount: '0.02',
      directDepositedAmount: '0.02',
    } as unknown as MarketPosition
    const position = buildBorrowMarketPosition({
      marketId: aaveMarket.marketId,
      collateralAsset: ETH,
      borrowAsset: USDC,
      collateralAmountFormatted: '0.02',
      borrowAmount: 14_000000n,
      borrowAmountFormatted: '14',
    }) as BorrowPosition
    render(<BorrowAction selectedLendPosition={lend} />, {
      wrapper: makeBorrowContextWrapper(
        ctx(aaveMarket, { borrowPositions: [position] }),
      ),
    })
    // Collateral row shows the lend amount (0.02 ETH), not the doubled 0.04.
    expect(screen.getByText('0.02')).toBeInTheDocument()
    expect(screen.queryByText('0.04')).not.toBeInTheDocument()
  })
})
