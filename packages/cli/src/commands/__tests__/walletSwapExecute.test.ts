import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runWalletSwapExecute } from '@/commands/wallet/swap/execute.js'
import { __resetEnvCacheForTests } from '@/config/env.js'
import * as walletCtx from '@/context/walletContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

const ANVIL_ACCOUNT_0 =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

const successReceipt = (hash: string) => ({
  transactionHash: hash,
  status: 'success' as const,
  blockNumber: 9n,
  gasUsed: 80000n,
})

const stubResult = (receipt: unknown) => ({
  receipt,
  amountIn: 5,
  amountOut: 4.9,
  amountInRaw: 5000000n,
  amountOutRaw: 4900000000000000000n,
  assetIn: { metadata: { symbol: 'USDC_DEMO' } },
  assetOut: { metadata: { symbol: 'OP_DEMO' } },
  price: 0.98,
  priceImpact: 0.001,
})

describe('runWalletSwapExecute', () => {
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
    execute: (params: unknown) => Promise<unknown>,
    withSwap = true,
  ) => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0xabc',
        swap: withSwap ? { execute } : undefined,
      } as never,
    })
  }

  it('emits a structured envelope with normalised array of receipts', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return stubResult([successReceipt('0xapprove'), successReceipt('0xswap')])
    })
    await runWalletSwapExecute({
      in: 'USDC_DEMO',
      out: 'OP_DEMO',
      amountIn: '5',
      chain: 'unichain',
    })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.action).toBe('execute')
    expect(body.assetIn.symbol).toBe('USDC_DEMO')
    expect(body.assetOut.symbol).toBe('OP_DEMO')
    expect(body.amountInRaw).toBe('5000000')
    expect(body.amountOutRaw).toBe('4900000000000000000')
    expect(body.transactions).toHaveLength(2)
    expect(body.transactions[0].transactionHash).toBe('0xapprove')
    const call = captured[0] as { chainId: number }
    expect(call.chainId).toBe(130)
  })

  it('wraps a single receipt into a one-element array', async () => {
    mockWallet(async () => stubResult(successReceipt('0xonly')))
    await runWalletSwapExecute({
      in: 'USDC_DEMO',
      out: 'OP_DEMO',
      amountOut: '5',
      chain: 'unichain',
    })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.transactions).toHaveLength(1)
  })

  it('maps reverted receipts to CliError(onchain)', async () => {
    mockWallet(async () =>
      stubResult([
        successReceipt('0xapprove'),
        { ...successReceipt('0xrevert'), status: 'reverted' as const },
      ]),
    )
    try {
      await runWalletSwapExecute({
        in: 'USDC_DEMO',
        out: 'OP_DEMO',
        amountIn: '1',
        chain: 'unichain',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('onchain')
    }
  })

  it('maps RPC failures to CliError(network) and marks them retryable', async () => {
    mockWallet(async () => {
      throw new Error('HTTP request failed. Status: ECONNREFUSED')
    })
    try {
      await runWalletSwapExecute({
        in: 'USDC_DEMO',
        out: 'OP_DEMO',
        amountIn: '1',
        chain: 'unichain',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
      expect((err as CliError).retryable).toBe(true)
    }
  })

  it('rejects when both --amount-in and --amount-out are set', async () => {
    mockWallet(async () => stubResult(successReceipt('0x')))
    try {
      await runWalletSwapExecute({
        in: 'USDC_DEMO',
        out: 'OP_DEMO',
        amountIn: '1',
        amountOut: '1',
        chain: 'unichain',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects with CliError(config) when wallet.swap is undefined', async () => {
    mockWallet(async () => stubResult(successReceipt('0x')), false)
    try {
      await runWalletSwapExecute({
        in: 'USDC_DEMO',
        out: 'OP_DEMO',
        amountIn: '1',
        chain: 'unichain',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })

  it('rejects with CliError(config) when PRIVATE_KEY is missing', async () => {
    delete process.env.PRIVATE_KEY
    __resetEnvCacheForTests()
    try {
      await runWalletSwapExecute({
        in: 'USDC_DEMO',
        out: 'OP_DEMO',
        amountIn: '1',
        chain: 'unichain',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })
})
