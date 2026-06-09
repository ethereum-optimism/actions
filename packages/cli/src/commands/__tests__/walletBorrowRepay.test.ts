import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANVIL_ACCOUNT_0 } from '@/__mocks__/anvilAccounts.js'
import { runWalletBorrowRepay } from '@/commands/wallet/borrow/repay.js'
import { __resetEnvCacheForTests } from '@/config/env.js'
import * as walletCtx from '@/context/walletContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

const successReceipt = (hash: string) => ({
  transactionHash: hash,
  status: 'success' as const,
  blockNumber: 4n,
  gasUsed: 30000n,
})

const wrap = (tx: ReturnType<typeof successReceipt>) => ({
  action: 'repay' as const,
  marketId: { kind: 'morpho-blue', marketId: '0xff', chainId: 84532 },
  receipt: tx,
})

describe('runWalletBorrowRepay', () => {
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

  const mockWallet = (repay: (params: unknown) => Promise<unknown>) => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0xabc',
        borrow: {
          repay,
          openPosition: async () => null,
          closePosition: async () => null,
          depositCollateral: async () => null,
          withdrawCollateral: async () => null,
        },
        has: (n: string) => n === 'borrow',
      } as never,
    })
  }

  it('wraps --amount in { amount } and forwards approval-mode', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return wrap(successReceipt('0xrepay'))
    })
    await runWalletBorrowRepay({
      market: 'demo-dusdc-op',
      amount: '0.25',
      approvalMode: 'max',
    })
    const call = captured[0] as {
      amount: { amount?: number; max?: boolean }
      approvalMode?: string
    }
    expect(call.amount).toEqual({ amount: 0.25 })
    expect(call.approvalMode).toBe('max')
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.action).toBe('repay')
    expect(body.borrowAmount).toBe(0.25)
    expect(body.collateralAmount).toBeUndefined()
  })

  it('forwards { max: true } when --max is set', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return wrap(successReceipt('0xrepay'))
    })
    await runWalletBorrowRepay({
      market: 'demo-dusdc-op',
      max: true,
    })
    const call = captured[0] as { amount: { max?: boolean } }
    expect(call.amount).toEqual({ max: true })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.borrowAmount).toBe('max')
  })

  it('rejects --amount + --max with CliError(validation)', async () => {
    mockWallet(async () => wrap(successReceipt('0x')))
    try {
      await runWalletBorrowRepay({
        market: 'demo-dusdc-op',
        amount: '1',
        max: true,
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects neither --amount nor --max with CliError(validation)', async () => {
    mockWallet(async () => wrap(successReceipt('0x')))
    try {
      await runWalletBorrowRepay({ market: 'demo-dusdc-op' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects invalid --approval-mode with CliError(validation)', async () => {
    mockWallet(async () => wrap(successReceipt('0x')))
    try {
      await runWalletBorrowRepay({
        market: 'demo-dusdc-op',
        amount: '1',
        approvalMode: 'infinite',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })
})
