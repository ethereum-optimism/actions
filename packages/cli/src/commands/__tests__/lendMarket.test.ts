import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runLendMarket } from '@/commands/lend/market.js'
import * as baseCtx from '@/context/baseContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

describe('runLendMarket', () => {
  let writeSpy: MockInstance

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockActions = (getMarket: (params: unknown) => Promise<unknown>) => {
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: getDemoConfig(),
      actions: { lend: { getMarket } } as never,
    })
  }

  it('routes by resolved market and emits the SDK shape verbatim', async () => {
    const captured: unknown[] = []
    mockActions(async (params) => {
      captured.push(params)
      return {
        marketId: params,
        name: 'Gauntlet USDC',
        asset: { metadata: { symbol: 'USDC_DEMO' } },
        supply: { totalAssets: 42n, totalShares: 41n },
        apy: {
          total: 0.05,
          native: 0.04,
          totalRewards: 0.01,
          performanceFee: 0.1,
        },
        metadata: { owner: '0x', curator: '0x', fee: 0, lastUpdate: 0 },
      }
    })
    await runLendMarket({ market: 'gauntlet-usdc' })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.name).toBe('Gauntlet USDC')
    expect(body.supply.totalAssets).toBe('42')
    expect(captured).toHaveLength(1)
    const call = captured[0] as { address: string; chainId: number }
    expect(call.chainId).toBe(84532)
  })

  it('rejects unknown markets with CliError(validation)', async () => {
    mockActions(async () => ({}))
    try {
      await runLendMarket({ market: 'no-such-market' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('maps RPC failures to CliError(network)', async () => {
    mockActions(async () => {
      throw new Error('fetch failed')
    })
    try {
      await runLendMarket({ market: 'gauntlet-usdc' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
    }
  })
})
