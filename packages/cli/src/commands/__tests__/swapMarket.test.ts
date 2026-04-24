import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runSwapMarket } from '@/commands/swap/market.js'
import * as baseCtx from '@/context/baseContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

describe('runSwapMarket', () => {
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
      actions: { swap: { getMarket } } as never,
    })
  }

  it('looks up the market with the resolved chainId and pool', async () => {
    const captured: unknown[] = []
    mockActions(async (params) => {
      captured.push(params)
      return {
        marketId: params,
        assets: [
          { metadata: { symbol: 'USDC_DEMO' } },
          { metadata: { symbol: 'OP_DEMO' } },
        ],
        fee: 100,
        provider: 'uniswap',
      }
    })
    await runSwapMarket({ pool: '0xpool', chain: 'unichain' })
    expect(captured[0]).toEqual({ poolId: '0xpool', chainId: 130 })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.provider).toBe('uniswap')
  })

  it('rejects unknown --chain values with CliError(validation)', async () => {
    mockActions(async () => ({}))
    try {
      await runSwapMarket({ pool: '0x', chain: 'no-such-chain' })
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
      await runSwapMarket({ pool: '0x', chain: 'unichain' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
    }
  })
})
