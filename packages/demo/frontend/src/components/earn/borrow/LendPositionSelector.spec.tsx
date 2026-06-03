import { render, screen } from '@testing-library/react'
import type { Asset } from '@eth-optimism/actions-sdk'
import { describe, expect, it, vi } from 'vitest'

import type { MarketPosition } from '@/types/market'
import { LendPositionSelector } from './LendPositionSelector'

const ETH: Asset = {
  type: 'native',
  address: { 11155420: '0x4200000000000000000000000000000000000006' },
  metadata: { symbol: 'ETH', name: 'Ether', decimals: 18 },
}

function ethPosition(depositedAmount: string): MarketPosition {
  return {
    marketName: 'Aave ETH',
    marketLogo: 'aave.svg',
    networkName: 'OP Sepolia',
    networkLogo: 'op.svg',
    asset: ETH,
    assetLogo: 'eth.svg',
    apy: 0.02,
    depositedAmount,
    directDepositedAmount: depositedAmount,
    depositedShares: null,
    depositedSharesRaw: null,
    directDepositedShares: null,
    directDepositedSharesRaw: null,
    pledgedCollateralAmount: null,
    isLoadingApy: false,
    isLoadingPosition: false,
    marketId: {
      address: '0x4200000000000000000000000000000000000006',
      chainId: 11155420,
    },
    provider: 'aave',
  }
}

describe('LendPositionSelector', () => {
  it('prices the deposited ETH amount in USD (0.01 ETH -> $30, not $0.01)', () => {
    const position = ethPosition('0.01')
    render(
      <LendPositionSelector
        positions={[position]}
        selected={position}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('$30.00')).toBeInTheDocument()
    expect(screen.queryByText('$0.01')).not.toBeInTheDocument()
  })
})
