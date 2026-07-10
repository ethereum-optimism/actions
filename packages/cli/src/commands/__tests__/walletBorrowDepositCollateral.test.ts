import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANVIL_ACCOUNT_0 } from '@/__mocks__/anvilAccounts.js'
import { runWalletBorrowDepositCollateral } from '@/commands/wallet/borrow/deposit-collateral.js'
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
  action: 'depositCollateral' as const,
  marketId: { kind: 'morpho-blue', marketId: '0xff', chainId: 84532 },
  receipt: tx,
})

describe('runWalletBorrowDepositCollateral', () => {
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
    depositCollateral: (params: unknown) => Promise<unknown>,
  ) => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0xabc',
        borrow: {
          depositCollateral,
          openPosition: async () => null,
          closePosition: async () => null,
          withdrawCollateral: async () => null,
          repay: async () => null,
        },
        has: (n: string) => n === 'borrow',
      } as never,
    })
  }

  it('wraps --amount in { amount } and forwards approval-mode', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return wrap(successReceipt('0xdeposit'))
    })
    await runWalletBorrowDepositCollateral({
      market: 'demo-dusdc-op',
      amount: '5',
      approvalMode: 'exact',
    })
    const call = captured[0] as {
      amount: { amount: number }
      approvalMode?: string
    }
    expect(call.amount).toEqual({ amount: 5 })
    expect(call.approvalMode).toBe('exact')
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.action).toBe('depositCollateral')
    expect(body.collateralAmount).toBe(5)
    expect(body.borrowAmount).toBeUndefined()
  })

  it.each(['0', '-1', 'foo', '1e10'])(
    'rejects --amount %p with CliError(validation)',
    async (bad) => {
      mockWallet(async () => wrap(successReceipt('0x')))
      try {
        await runWalletBorrowDepositCollateral({
          market: 'demo-dusdc-op',
          amount: bad,
        })
        throw new Error(`did not throw for ${bad}`)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('validation')
      }
    },
  )

  it('rejects unknown markets with CliError(validation)', async () => {
    mockWallet(async () => wrap(successReceipt('0x')))
    try {
      await runWalletBorrowDepositCollateral({
        market: 'no-such-market',
        amount: '1',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })
})
