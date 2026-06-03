import { render, screen } from '@testing-library/react'
import type {
  Asset,
  BorrowMarket,
  SupportedChainId,
} from '@eth-optimism/actions-sdk'
import { describe, expect, it, vi } from 'vitest'

import { makeBorrowContextWrapper } from '@/test-utils/borrowFixtures'
import type { MarketPosition } from '@/types/market'
import type { UseBorrowProviderReturn } from '@/hooks/useBorrowProvider'
import { BorrowAction } from './BorrowAction'

// Render-only test: stub the transaction/projection hooks so the form's
// market selection depends purely on context + the selected lend position.
vi.mock('@/hooks/useBorrowTransaction', () => ({
  useBorrowTransaction: () => ({
    isExecuting: false,
    runTransaction: vi.fn(),
    txModal: { isOpen: false, status: 'loading', onClose: vi.fn() },
    toast: { visible: false, title: '', description: '', onClose: vi.fn() },
  }),
}))
vi.mock('@/hooks/useBorrowQuotePreview', () => ({
  useBorrowQuotePreview: () => ({ livePreview: null, isPreviewLoading: false }),
}))
vi.mock('@/hooks/useBorrowProjection', () => ({
  useBorrowProjection: () => ({
    currentLtv: 0,
    projectedLtv: 0,
    wouldLiquidate: false,
    projectedHealthFactor: Number.POSITIVE_INFINITY,
  }),
}))

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
  marketId: { kind: 'aave-v3', marketId: '0x' + 'c'.repeat(64), chainId: OPS },
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

function ctx(selectedMarket: BorrowMarket): UseBorrowProviderReturn {
  return {
    markets: [morphoMarket, aaveMarket],
    selectedMarket,
    borrowPositions: [],
    handleMarketSelect: vi.fn(),
    handleTransaction: vi.fn(),
    getQuote: vi.fn(),
  } as unknown as UseBorrowProviderReturn
}

describe('BorrowAction market binding', () => {
  it('borrows USDC against an ETH lend position even when the global default is the Morpho (OP) market', () => {
    render(<BorrowAction selectedLendPosition={ethLendPosition} />, {
      // selectedMarket defaults to the Morpho market (m[0]); the form must
      // still target the Aave market because the chosen collateral is ETH.
      wrapper: makeBorrowContextWrapper(ctx(morphoMarket)),
    })
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.queryByText('OP')).not.toBeInTheDocument()
  })
})
