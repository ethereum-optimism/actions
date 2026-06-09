import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANVIL_ACCOUNT_0 } from '@/__mocks__/anvilAccounts.js'
import { runWalletBorrowWithdrawCollateral } from '@/commands/wallet/borrow/withdraw-collateral.js'
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
  action: 'withdrawCollateral' as const,
  marketId: { kind: 'morpho-blue', marketId: '0xff', chainId: 84532 },
  receipt: tx,
})

describe('runWalletBorrowWithdrawCollateral', () => {
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
    withdrawCollateral: (params: unknown) => Promise<unknown>,
  ) => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0xabc',
        borrow: {
          withdrawCollateral,
          openPosition: async () => null,
          closePosition: async () => null,
          depositCollateral: async () => null,
          repay: async () => null,
        },
        has: (n: string) => n === 'borrow',
      } as never,
    })
  }

  it('wraps --amount in { amount }', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return wrap(successReceipt('0xwithdraw'))
    })
    await runWalletBorrowWithdrawCollateral({
      market: 'demo-dusdc-op',
      amount: '0.5',
    })
    const call = captured[0] as { amount: { amount?: number; max?: boolean } }
    expect(call.amount).toEqual({ amount: 0.5 })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.action).toBe('withdrawCollateral')
    expect(body.collateralAmount).toBe(0.5)
  })

  it('forwards { max: true } when --max is set', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return wrap(successReceipt('0xwithdraw'))
    })
    await runWalletBorrowWithdrawCollateral({
      market: 'demo-dusdc-op',
      max: true,
    })
    const call = captured[0] as { amount: { amount?: number; max?: boolean } }
    expect(call.amount).toEqual({ max: true })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.collateralAmount).toBe('max')
  })

  it('rejects --amount + --max together with CliError(validation)', async () => {
    mockWallet(async () => wrap(successReceipt('0x')))
    try {
      await runWalletBorrowWithdrawCollateral({
        market: 'demo-dusdc-op',
        amount: '1',
        max: true,
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/not both/)
    }
  })

  it('rejects neither --amount nor --max with CliError(validation)', async () => {
    mockWallet(async () => wrap(successReceipt('0x')))
    try {
      await runWalletBorrowWithdrawCollateral({ market: 'demo-dusdc-op' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/required/)
    }
  })
})
