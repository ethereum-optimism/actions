import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runBorrowMarkets } from '@/commands/actions/borrow/markets.js'
import * as baseCtx from '@/context/baseContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

describe('runBorrowMarkets', () => {
  let writeSpy: MockInstance

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockActions = (getMarkets: (params?: unknown) => Promise<unknown>) => {
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: getDemoConfig(),
      actions: { borrow: { getMarkets } } as never,
    })
  }

  it('emits the array of markets with bigints stringified', async () => {
    mockActions(async () => [
      {
        marketId: {
          kind: 'morpho-blue',
          marketId: '0xdeadbeef',
          chainId: 84532,
        },
        name: 'Demo dUSDC / OP',
        collateralAsset: { metadata: { symbol: 'USDC_DEMO' } },
        borrowAsset: { metadata: { symbol: 'OP_DEMO' } },
        borrowApy: 0.05,
        liquidationBonus: 0.05,
        maxLtv: 0.86,
        healthBufferPct: 0.05,
        totalBorrowed: 1000000n,
        totalCollateral: 999999n,
      },
    ])
    await runBorrowMarkets()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('Demo dUSDC / OP')
    expect(body[0].totalBorrowed).toBe('1000000')
    expect(body[0].marketId.kind).toBe('morpho-blue')
  })

  it('forwards --collateral as collateralAsset and --chain as chainId', async () => {
    const captured: unknown[] = []
    mockActions(async (params) => {
      captured.push(params)
      return []
    })
    await runBorrowMarkets({
      collateral: 'USDC_DEMO',
      chain: 'base-sepolia',
    })
    expect(captured).toHaveLength(1)
    const call = captured[0] as {
      collateralAsset?: { metadata: { symbol: string } }
      borrowAsset?: unknown
      chainId?: number
    }
    expect(call.collateralAsset?.metadata.symbol).toBe('USDC_DEMO')
    expect(call.borrowAsset).toBeUndefined()
    expect(call.chainId).toBe(84532)
  })

  it('forwards --borrow-asset as borrowAsset', async () => {
    const captured: unknown[] = []
    mockActions(async (params) => {
      captured.push(params)
      return []
    })
    await runBorrowMarkets({ borrowAsset: 'OP_DEMO' })
    const call = captured[0] as {
      borrowAsset?: { metadata: { symbol: string } }
    }
    expect(call.borrowAsset?.metadata.symbol).toBe('OP_DEMO')
  })

  it('rejects unknown --collateral with CliError(validation)', async () => {
    mockActions(async () => [])
    try {
      await runBorrowMarkets({ collateral: 'NOSUCH' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects multi-chain --chain values with CliError(validation)', async () => {
    mockActions(async () => [])
    try {
      await runBorrowMarkets({ chain: 'base-sepolia,op-sepolia' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/single chain/)
    }
  })

  it('maps RPC failures to CliError(network)', async () => {
    mockActions(async () => {
      throw new Error('HTTP request failed. Status: ECONNREFUSED')
    })
    try {
      await runBorrowMarkets()
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
      expect((err as CliError).retryable).toBe(true)
    }
  })
})
