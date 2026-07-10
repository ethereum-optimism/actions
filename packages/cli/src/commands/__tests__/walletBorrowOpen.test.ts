import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANVIL_ACCOUNT_0 } from '@/__mocks__/anvilAccounts.js'
import { runWalletBorrowOpen } from '@/commands/wallet/borrow/open.js'
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
  blockNumber: 1n,
  gasUsed: 21000n,
})

const wrap = (tx: ReturnType<typeof successReceipt>) => ({
  action: 'open' as const,
  marketId: { kind: 'morpho-blue', marketId: '0xff', chainId: 84532 },
  receipt: tx,
  transactionHash: tx.transactionHash,
})

describe('runWalletBorrowOpen', () => {
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
    openPosition: (params: unknown) => Promise<unknown>,
    has: (n: string) => boolean = (n) => n === 'borrow',
  ) => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0xabc',
        borrow: {
          openPosition,
          closePosition: async () => null,
          depositCollateral: async () => null,
          withdrawCollateral: async () => null,
          repay: async () => null,
        },
        has,
      } as never,
    })
  }

  it('emits a structured envelope with the borrow + collateral legs', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return wrap(successReceipt('0xopen'))
    })
    await runWalletBorrowOpen({
      market: 'demo-dusdc-op',
      borrowAmount: '1',
      collateralAmount: '2',
    })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.action).toBe('open')
    expect(body.market.name).toBe('Demo dUSDC / OP')
    expect(body.market.provider).toBe('morpho')
    expect(body.market.marketId.kind).toBe('morpho-blue')
    expect(body.borrowAmount).toBe(1)
    expect(body.collateralAmount).toBe(2)
    expect(body.transactions).toHaveLength(1)
    expect(body.transactions[0].transactionHash).toBe('0xopen')
    const call = captured[0] as {
      borrowAmount: { amount: number }
      collateralAmount: { amount: number }
      market: { kind: string; marketId: string }
    }
    expect(call.borrowAmount).toEqual({ amount: 1 })
    expect(call.collateralAmount).toEqual({ amount: 2 })
    expect(call.market.kind).toBe('morpho-blue')
  })

  it('omits collateralAmount when --collateral-amount is unset', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return wrap(successReceipt('0xopen'))
    })
    await runWalletBorrowOpen({
      market: 'demo-dusdc-op',
      borrowAmount: '5',
    })
    const call = captured[0] as { collateralAmount?: unknown }
    expect(call.collateralAmount).toBeUndefined()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.borrowAmount).toBe(5)
    expect(body.collateralAmount).toBeUndefined()
  })

  it('forwards --approval-mode to the SDK when set', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return wrap(successReceipt('0x'))
    })
    await runWalletBorrowOpen({
      market: 'demo-dusdc-op',
      borrowAmount: '1',
      approvalMode: 'max',
    })
    const call = captured[0] as { approvalMode?: string }
    expect(call.approvalMode).toBe('max')
  })

  it('rejects invalid --approval-mode with CliError(validation)', async () => {
    mockWallet(async () => wrap(successReceipt('0x')))
    try {
      await runWalletBorrowOpen({
        market: 'demo-dusdc-op',
        borrowAmount: '1',
        approvalMode: 'infinite',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects unknown markets with CliError(validation)', async () => {
    mockWallet(async () => wrap(successReceipt('0x')))
    try {
      await runWalletBorrowOpen({
        market: 'no-such-market',
        borrowAmount: '1',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it.each(['0', '-1', 'foo', '1e10'])(
    'rejects --borrow-amount %p with CliError(validation)',
    async (bad) => {
      mockWallet(async () => wrap(successReceipt('0x')))
      try {
        await runWalletBorrowOpen({
          market: 'demo-dusdc-op',
          borrowAmount: bad,
        })
        throw new Error(`did not throw for ${bad}`)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('validation')
      }
    },
  )

  it('rejects with CliError(config) when wallet.borrow is undefined', async () => {
    mockWallet(
      async () => wrap(successReceipt('0x')),
      () => false,
    )
    try {
      await runWalletBorrowOpen({
        market: 'demo-dusdc-op',
        borrowAmount: '1',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })

  it('maps reverted receipts to CliError(onchain)', async () => {
    mockWallet(async () =>
      wrap({ ...successReceipt('0xrevert'), status: 'reverted' } as never),
    )
    try {
      await runWalletBorrowOpen({
        market: 'demo-dusdc-op',
        borrowAmount: '1',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('onchain')
    }
  })

  it('flattens a batched receipt array via toReceiptArray', async () => {
    mockWallet(async () => ({
      action: 'open' as const,
      marketId: { kind: 'morpho-blue', marketId: '0xff', chainId: 84532 },
      receipt: [successReceipt('0xapprove'), successReceipt('0xopen')],
    }))
    await runWalletBorrowOpen({
      market: 'demo-dusdc-op',
      borrowAmount: '1',
      collateralAmount: '2',
    })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.transactions).toHaveLength(2)
    expect(body.transactions[0].transactionHash).toBe('0xapprove')
    expect(body.transactions[1].transactionHash).toBe('0xopen')
  })

  it('decorates the envelope with positionAfter highlights when present', async () => {
    mockWallet(async () => ({
      action: 'open' as const,
      marketId: { kind: 'morpho-blue', marketId: '0xff', chainId: 84532 },
      receipt: successReceipt('0xopen'),
      positionAfter: {
        ltv: 0.5,
        healthFactor: 1.72,
        liquidationPriceFormatted: '1.234',
      },
    }))
    await runWalletBorrowOpen({
      market: 'demo-dusdc-op',
      borrowAmount: '1',
      collateralAmount: '2',
    })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.ltv).toBe(0.5)
    expect(body.healthFactor).toBe(1.72)
    expect(body.liquidationPriceFormatted).toBe('1.234')
  })
})
