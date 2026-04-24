import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runSwapMarkets } from '@/commands/swap/markets.js'
import * as baseCtx from '@/context/baseContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

describe('runSwapMarkets', () => {
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
      actions: { swap: { getMarkets } } as never,
    })
  }

  it('emits the array of markets', async () => {
    mockActions(async () => [
      {
        marketId: { poolId: '0xpool', chainId: 84532 },
        assets: [
          { metadata: { symbol: 'USDC_DEMO' } },
          { metadata: { symbol: 'OP_DEMO' } },
        ],
        fee: 100,
        provider: 'uniswap',
      },
    ])
    await runSwapMarkets()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toHaveLength(1)
    expect(body[0].provider).toBe('uniswap')
    expect(body[0].marketId.poolId).toBe('0xpool')
  })

  it('forwards --chain to the SDK after resolution', async () => {
    const captured: unknown[] = []
    mockActions(async (params) => {
      captured.push(params)
      return []
    })
    await runSwapMarkets({ chain: 'base-sepolia' })
    expect(captured[0]).toEqual({ chainId: 84532 })
  })

  it('rejects unknown --chain values with CliError(validation)', async () => {
    mockActions(async () => [])
    try {
      await runSwapMarkets({ chain: 'no-such-chain' })
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
      await runSwapMarkets()
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
    }
  })
})
