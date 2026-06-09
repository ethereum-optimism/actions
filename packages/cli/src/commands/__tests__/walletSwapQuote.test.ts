import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANVIL_ACCOUNT_0 } from '@/__mocks__/anvilAccounts.js'
import { runWalletSwapQuote } from '@/commands/wallet/swap/quote.js'
import { runWalletSwapQuotes } from '@/commands/wallet/swap/quotes.js'
import { __resetEnvCacheForTests } from '@/config/env.js'
import * as walletCtx from '@/context/walletContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

const stubQuote = (provider: 'uniswap' | 'velodrome', amountOutRaw: bigint) =>
  ({
    provider,
    assetIn: { metadata: { symbol: 'USDC_DEMO' } },
    assetOut: { metadata: { symbol: 'OP_DEMO' } },
    amountIn: 1,
    amountOut: 0.95,
    amountInRaw: 1000000n,
    amountOutRaw,
    price: 0.95,
    priceImpact: 0.001,
    slippage: 0.005,
    recipient: '0xabc',
  }) as unknown

describe('wallet swap quote/quotes (recipient-bound)', () => {
  const originalEnv = process.env
  let writeSpy: MockInstance

  beforeEach(() => {
    process.env = { ...originalEnv, PRIVATE_KEY: ANVIL_ACCOUNT_0 }
    __resetEnvCacheForTests()
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    process.env = originalEnv
    __resetEnvCacheForTests()
    vi.restoreAllMocks()
  })

  const mockWallet = (
    getQuote?: (params: unknown) => Promise<unknown>,
    getQuotes?: (params: unknown) => Promise<unknown>,
    withSwap = true,
  ) => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0xabc',
        swap: withSwap ? { getQuote, getQuotes } : undefined,
      } as never,
    })
  }

  it('runWalletSwapQuote calls wallet.swap.getQuote with built params', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return stubQuote('uniswap', 950000000000000000n)
    })
    await runWalletSwapQuote({
      in: 'USDC_DEMO',
      out: 'OP_DEMO',
      amountIn: '1',
      chain: 'base-sepolia',
    })
    expect(captured).toHaveLength(1)
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.provider).toBe('uniswap')
  })

  it('runWalletSwapQuotes calls wallet.swap.getQuotes', async () => {
    const captured: unknown[] = []
    mockWallet(undefined, async (params) => {
      captured.push(params)
      return [
        stubQuote('uniswap', 950000000000000000n),
        stubQuote('velodrome', 940000000000000000n),
      ]
    })
    await runWalletSwapQuotes({
      in: 'USDC_DEMO',
      out: 'OP_DEMO',
      amountIn: '1',
      chain: 'base-sepolia',
    })
    expect(captured).toHaveLength(1)
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toHaveLength(2)
  })

  it('rejects with CliError(config) when wallet.swap is undefined', async () => {
    mockWallet(async () => stubQuote('uniswap', 1n), undefined, false)
    try {
      await runWalletSwapQuote({
        in: 'USDC_DEMO',
        out: 'OP_DEMO',
        amountIn: '1',
        chain: 'base-sepolia',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })
})
