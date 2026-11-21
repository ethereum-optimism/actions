import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TokenBalance } from '@eth-optimism/actions-sdk'
import { baseSepolia } from 'viem/chains'

import { useTotalBalance } from '../useTotalBalance'

const WETH_BASE_SEPOLIA = '0x4200000000000000000000000000000000000006'
const USDC_DEMO_ADDRESS = '0x'.padEnd(42, '1')

const balance = (
  symbol: string,
  address: string,
  totalBalance: number,
): TokenBalance =>
  ({
    asset: {
      address: { [baseSepolia.id]: address },
      metadata: { symbol, name: symbol, decimals: 18 },
      type: address === 'native' ? 'native' : 'erc20',
    },
    totalBalance,
    totalBalanceRaw: 0n,
    chains: { [baseSepolia.id]: { balance: totalBalance, balanceRaw: 0n } },
  }) as unknown as TokenBalance

const usdc = balance('USDC_DEMO', USDC_DEMO_ADDRESS, 25)
const eth = balance('ETH', 'native', 0.5)

describe('useTotalBalance', () => {
  it('lists native ETH and counts it toward the total', async () => {
    // 1 ETH = 2000 USDC
    const getPrice = vi.fn().mockResolvedValue({ amountOut: 2000 })

    const { result } = renderHook(() =>
      useTotalBalance({ balances: [usdc, eth], getPrice }),
    )

    await waitFor(() => expect(result.current.totalUsd).toBeGreaterThan(25))

    const symbols = result.current.tokenBalances.map((t) => t.symbol)
    expect(symbols).toContain('ETH')
    // 25 USDC + 0.5 ETH @ 2000
    expect(result.current.totalUsd).toBe(1025)
  })

  it('quotes native ETH through WETH, since a native asset has no tradable address', async () => {
    const getPrice = vi.fn().mockResolvedValue({ amountOut: 2000 })

    renderHook(() => useTotalBalance({ balances: [usdc, eth], getPrice }))

    await waitFor(() => expect(getPrice).toHaveBeenCalled())
    expect(getPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenInAddress: WETH_BASE_SEPOLIA,
        tokenOutAddress: USDC_DEMO_ADDRESS,
        chainId: baseSepolia.id,
      }),
    )
  })

  it('still lists ETH when it cannot be priced, rather than dropping it', async () => {
    // No pool for the pair — the quote path returns null.
    const getPrice = vi.fn().mockResolvedValue(null)

    const { result } = renderHook(() =>
      useTotalBalance({ balances: [usdc, eth], getPrice }),
    )

    await waitFor(() => expect(getPrice).toHaveBeenCalled())

    const ethRow = result.current.tokenBalances.find((t) => t.symbol === 'ETH')
    expect(ethRow).toBeDefined()
    expect(ethRow?.balance).toBe(0.5)
    expect(ethRow?.usdValue).toBe(0)
  })

  it('hides assets with a zero balance', () => {
    const getPrice = vi.fn().mockResolvedValue(null)

    const { result } = renderHook(() =>
      useTotalBalance({
        balances: [usdc, balance('ETH', 'native', 0)],
        getPrice,
      }),
    )

    expect(result.current.tokenBalances.map((t) => t.symbol)).toEqual(['USDC'])
  })
})
