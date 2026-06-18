import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import type { Asset } from '@eth-optimism/actions-sdk'
import { describe, expect, it } from 'vitest'

import { assetBalanceAmount } from './balanceMatching'

const usdc = {
  metadata: { symbol: 'USDC_DEMO', decimals: 6 },
} as unknown as Asset

// USDC_DEMO held on two chains: the cross-chain total double-counts what is
// actually spendable on a single chain (the repay-gate regression).
const balances = [
  {
    asset: usdc,
    totalBalance: 12,
    totalBalanceRaw: 12_000_000n,
    chains: {
      11155420: { balance: 5, balanceRaw: 5_000_000n },
      84532: { balance: 7, balanceRaw: 7_000_000n },
    },
  },
] as unknown as TokenBalance[]

describe('assetBalanceAmount', () => {
  it('returns the cross-chain total when no chainId is given', () => {
    expect(assetBalanceAmount(balances, usdc)).toBe(12)
  })

  it('scopes to a single chain when chainId is given', () => {
    expect(assetBalanceAmount(balances, usdc, 11155420)).toBe(5)
    expect(assetBalanceAmount(balances, usdc, 84532)).toBe(7)
  })

  it('returns 0 when the asset holds no balance on the requested chain', () => {
    expect(assetBalanceAmount(balances, usdc, 1)).toBe(0)
  })

  it('returns 0 for a missing asset or empty inputs', () => {
    expect(assetBalanceAmount(balances, null)).toBe(0)
    expect(assetBalanceAmount(undefined, usdc, 11155420)).toBe(0)
  })
})
