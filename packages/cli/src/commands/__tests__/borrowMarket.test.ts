import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runBorrowMarket } from '@/commands/actions/borrow/market.js'
import * as baseCtx from '@/context/baseContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

describe('runBorrowMarket', () => {
  let writeSpy: MockInstance

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockActions = (getMarket: (id: unknown) => Promise<unknown>) => {
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: getDemoConfig(),
      actions: { borrow: { getMarket } } as never,
    })
  }

  it('forwards the resolved BorrowMarketConfig as the marketId argument', async () => {
    const captured: unknown[] = []
    mockActions(async (id) => {
      captured.push(id)
      return {
        marketId: { kind: 'morpho-blue', marketId: '0xff', chainId: 84532 },
        name: 'Demo dUSDC / OP',
        collateralAsset: { metadata: { symbol: 'USDC_DEMO' } },
        borrowAsset: { metadata: { symbol: 'OP_DEMO' } },
        borrowApy: 0.05,
        liquidationBonus: 0.05,
        maxLtv: 0.86,
        healthBufferPct: 0.05,
        totalBorrowed: 0n,
        totalCollateral: 0n,
      }
    })
    await runBorrowMarket({ market: 'demo-dusdc-op' })
    const arg = captured[0] as {
      kind: string
      marketId: string
      chainId: number
      collateralAsset: unknown
      marketParams: unknown
    }
    expect(arg.kind).toBe('morpho-blue')
    expect(arg.chainId).toBe(84532)
    expect(arg.marketId).toMatch(/^0x[a-fA-F0-9]{64}$/)
    expect(arg.collateralAsset).toBeDefined()
    expect(arg.marketParams).toBeDefined()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.name).toBe('Demo dUSDC / OP')
  })

  it('rejects unknown markets with CliError(validation)', async () => {
    mockActions(async () => ({}))
    try {
      await runBorrowMarket({ market: 'no-such-market' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('maps RPC failures to CliError(network)', async () => {
    mockActions(async () => {
      throw new Error('HTTP request failed')
    })
    try {
      await runBorrowMarket({ market: 'demo-dusdc-op' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
    }
  })
})
