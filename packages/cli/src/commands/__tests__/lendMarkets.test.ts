import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runLendMarkets } from '@/commands/lend/markets.js'
import * as baseCtx from '@/context/baseContext.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

describe('runLendMarkets', () => {
  let writeSpy: MockInstance

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockActions = (getMarkets: () => Promise<unknown>) => {
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: {} as never,
      actions: { lend: { getMarkets } } as never,
    })
  }

  it('emits the array of markets with bigints stringified', async () => {
    mockActions(async () => [
      {
        marketId: { address: '0xabc', chainId: 84532 },
        name: 'Gauntlet USDC',
        asset: { metadata: { symbol: 'USDC_DEMO' } },
        supply: { totalAssets: 1000000n, totalShares: 999999n },
        apy: {
          total: 0.05,
          native: 0.04,
          totalRewards: 0.01,
          performanceFee: 0.1,
        },
        metadata: {
          owner: '0xowner',
          curator: '0xcurator',
          fee: 100,
          lastUpdate: 0,
        },
      },
    ])
    await runLendMarkets()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('Gauntlet USDC')
    expect(body[0].supply.totalAssets).toBe('1000000')
    expect(body[0].marketId.chainId).toBe(84532)
  })

  it('maps RPC failures to CliError(network)', async () => {
    mockActions(async () => {
      throw new Error('HTTP request failed. Status: ECONNREFUSED')
    })
    try {
      await runLendMarkets()
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
      expect((err as CliError).retryable).toBe(true)
    }
  })
})
