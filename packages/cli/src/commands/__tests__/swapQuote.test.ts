import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runSwapQuote } from '@/commands/swap/quote.js'
import { runSwapQuotes } from '@/commands/swap/quotes.js'
import * as baseCtx from '@/context/baseContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

const stubQuote = (provider: string, amountOutRaw: bigint) => ({
  assetIn: { metadata: { symbol: 'USDC_DEMO' } },
  assetOut: { metadata: { symbol: 'OP_DEMO' } },
  chainId: 84532,
  amountIn: 5,
  amountInRaw: 5000000n,
  amountOut: 4.9,
  amountOutRaw,
  amountOutMin: 4.85,
  amountOutMinRaw: 4850000000000000000n,
  price: 0.98,
  priceInverse: 1.02,
  priceImpact: 0.001,
  route: { hops: [] },
  execution: { swapCalldata: '0x', routerAddress: '0xrouter', value: 0n },
  provider,
  slippage: 0.005,
  deadline: 1,
  quotedAt: 1,
  expiresAt: 2,
  quotedRecipient: '0xrecipient',
})

describe('runSwapQuote', () => {
  let writeSpy: MockInstance

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockActions = (getQuote: (params: unknown) => Promise<unknown>) => {
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: getDemoConfig(),
      actions: { swap: { getQuote } } as never,
    })
  }

  it('builds quote params from --in/--out/--amount-in/--chain and stringifies bigints', async () => {
    const captured: unknown[] = []
    mockActions(async (params) => {
      captured.push(params)
      return stubQuote('uniswap', 4900000000000000000n)
    })
    await runSwapQuote({
      in: 'USDC_DEMO',
      out: 'OP_DEMO',
      amountIn: '5',
      chain: 'base-sepolia',
    })
    const call = captured[0] as {
      assetIn: { metadata: { symbol: string } }
      assetOut: { metadata: { symbol: string } }
      chainId: number
      amountIn?: number
      amountOut?: number
      slippage?: number
      provider?: string
    }
    expect(call.assetIn.metadata.symbol).toBe('USDC_DEMO')
    expect(call.assetOut.metadata.symbol).toBe('OP_DEMO')
    expect(call.chainId).toBe(84532)
    expect(call.amountIn).toBe(5)
    expect(call.amountOut).toBeUndefined()
    expect(call.slippage).toBeUndefined()
    expect(call.provider).toBeUndefined()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.amountOutRaw).toBe('4900000000000000000')
    expect(body.provider).toBe('uniswap')
  })

  it('converts --slippage percent to SDK decimal', async () => {
    const captured: unknown[] = []
    mockActions(async (params) => {
      captured.push(params)
      return stubQuote('uniswap', 1n)
    })
    await runSwapQuote({
      in: 'USDC_DEMO',
      out: 'OP_DEMO',
      amountIn: '1',
      chain: 'base-sepolia',
      slippage: '0.5',
    })
    const call = captured[0] as { slippage: number }
    expect(call.slippage).toBeCloseTo(0.005, 12)
  })

  it('forwards --provider when supplied', async () => {
    const captured: unknown[] = []
    mockActions(async (params) => {
      captured.push(params)
      return stubQuote('velodrome', 1n)
    })
    await runSwapQuote({
      in: 'USDC_DEMO',
      out: 'OP_DEMO',
      amountIn: '1',
      chain: 'base-sepolia',
      provider: 'velodrome',
    })
    const call = captured[0] as { provider: string }
    expect(call.provider).toBe('velodrome')
  })

  it('rejects when both --amount-in and --amount-out are set', async () => {
    mockActions(async () => stubQuote('uniswap', 1n))
    try {
      await runSwapQuote({
        in: 'USDC_DEMO',
        out: 'OP_DEMO',
        amountIn: '1',
        amountOut: '1',
        chain: 'base-sepolia',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects when neither --amount-in nor --amount-out is set', async () => {
    mockActions(async () => stubQuote('uniswap', 1n))
    try {
      await runSwapQuote({
        in: 'USDC_DEMO',
        out: 'OP_DEMO',
        chain: 'base-sepolia',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects unknown asset symbols with CliError(validation)', async () => {
    mockActions(async () => stubQuote('uniswap', 1n))
    try {
      await runSwapQuote({
        in: 'NOPE',
        out: 'OP_DEMO',
        amountIn: '1',
        chain: 'base-sepolia',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects unknown providers with CliError(validation)', async () => {
    mockActions(async () => stubQuote('uniswap', 1n))
    try {
      await runSwapQuote({
        in: 'USDC_DEMO',
        out: 'OP_DEMO',
        amountIn: '1',
        chain: 'base-sepolia',
        provider: 'sushiswap',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects out-of-range slippage with CliError(validation)', async () => {
    mockActions(async () => stubQuote('uniswap', 1n))
    for (const bad of ['-1', '101', 'foo']) {
      try {
        await runSwapQuote({
          in: 'USDC_DEMO',
          out: 'OP_DEMO',
          amountIn: '1',
          chain: 'base-sepolia',
          slippage: bad,
        })
        throw new Error(`did not throw for ${bad}`)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('validation')
      }
    }
  })
})

describe('runSwapQuotes', () => {
  let writeSpy: MockInstance

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockActions = (getQuotes: (params: unknown) => Promise<unknown>) => {
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: getDemoConfig(),
      actions: { swap: { getQuotes } } as never,
    })
  }

  it('emits an array of quotes verbatim', async () => {
    mockActions(async () => [
      stubQuote('uniswap', 5000000000000000000n),
      stubQuote('velodrome', 4800000000000000000n),
    ])
    await runSwapQuotes({
      in: 'USDC_DEMO',
      out: 'OP_DEMO',
      amountIn: '5',
      chain: 'base-sepolia',
    })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toHaveLength(2)
    expect(body[0].provider).toBe('uniswap')
    expect(body[1].provider).toBe('velodrome')
    expect(body[0].amountOutRaw).toBe('5000000000000000000')
  })
})
