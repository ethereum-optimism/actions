import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANVIL_ACCOUNT_0 } from '@/__mocks__/anvilAccounts.js'
import { runWalletBorrowClose } from '@/commands/wallet/borrow/close.js'
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
  blockNumber: 9n,
  gasUsed: 50000n,
})

const wrap = (tx: ReturnType<typeof successReceipt>) => ({
  action: 'close' as const,
  marketId: { kind: 'morpho-blue', marketId: '0xff', chainId: 84532 },
  receipt: tx,
})

describe('runWalletBorrowClose', () => {
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

  const mockWallet = (closePosition: (params: unknown) => Promise<unknown>) => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0xabc',
        borrow: {
          closePosition,
          openPosition: async () => null,
          depositCollateral: async () => null,
          withdrawCollateral: async () => null,
          repay: async () => null,
        },
        has: (n: string) => n === 'borrow',
      } as never,
    })
  }

  it('forwards { max: true } on both legs when --borrow-max + --collateral-max are set', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return wrap(successReceipt('0xclose'))
    })
    await runWalletBorrowClose({
      market: 'demo-dusdc-op',
      borrowMax: true,
      collateralMax: true,
    })
    const call = captured[0] as {
      borrowAmount: { max?: boolean }
      collateralAmount: { max?: boolean }
    }
    expect(call.borrowAmount).toEqual({ max: true })
    expect(call.collateralAmount).toEqual({ max: true })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.borrowAmount).toBe('max')
    expect(body.collateralAmount).toBe('max')
  })

  it('wraps explicit amounts via { amount }', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return wrap(successReceipt('0xclose'))
    })
    await runWalletBorrowClose({
      market: 'demo-dusdc-op',
      borrowAmount: '0.5',
      collateralAmount: '0.25',
    })
    const call = captured[0] as {
      borrowAmount: { amount?: number }
      collateralAmount: { amount?: number }
    }
    expect(call.borrowAmount).toEqual({ amount: 0.5 })
    expect(call.collateralAmount).toEqual({ amount: 0.25 })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.borrowAmount).toBe(0.5)
    expect(body.collateralAmount).toBe(0.25)
  })

  it('omits the collateral leg when neither flag is set', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return wrap(successReceipt('0xclose'))
    })
    await runWalletBorrowClose({
      market: 'demo-dusdc-op',
      borrowMax: true,
    })
    const call = captured[0] as { collateralAmount?: unknown }
    expect(call.collateralAmount).toBeUndefined()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.collateralAmount).toBeUndefined()
  })

  it('rejects --borrow-amount + --borrow-max with CliError(validation)', async () => {
    mockWallet(async () => wrap(successReceipt('0x')))
    try {
      await runWalletBorrowClose({
        market: 'demo-dusdc-op',
        borrowAmount: '1',
        borrowMax: true,
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/not both/)
    }
  })

  it('rejects --collateral-amount + --collateral-max with CliError(validation)', async () => {
    mockWallet(async () => wrap(successReceipt('0x')))
    try {
      await runWalletBorrowClose({
        market: 'demo-dusdc-op',
        borrowMax: true,
        collateralAmount: '1',
        collateralMax: true,
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/not both/)
    }
  })

  it('rejects close with neither --borrow-amount nor --borrow-max as CliError(validation)', async () => {
    mockWallet(async () => wrap(successReceipt('0x')))
    try {
      await runWalletBorrowClose({ market: 'demo-dusdc-op' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/required/)
    }
  })

  it('maps reverted receipts to CliError(onchain)', async () => {
    mockWallet(async () =>
      wrap({ ...successReceipt('0xrevert'), status: 'reverted' } as never),
    )
    try {
      await runWalletBorrowClose({
        market: 'demo-dusdc-op',
        borrowMax: true,
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('onchain')
    }
  })

  it('preserves null ltv/healthFactor from a fully-repaid position', async () => {
    mockWallet(async () => ({
      action: 'close' as const,
      marketId: { kind: 'morpho-blue', marketId: '0xff', chainId: 84532 },
      receipt: successReceipt('0xclose'),
      positionAfter: {
        ltv: null,
        healthFactor: null,
        liquidationPriceFormatted: '0',
      },
    }))
    await runWalletBorrowClose({
      market: 'demo-dusdc-op',
      borrowMax: true,
      collateralMax: true,
    })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.ltv).toBeNull()
    expect(body.healthFactor).toBeNull()
  })
})
