import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANVIL_ACCOUNT_0 } from '@/__mocks__/anvilAccounts.js'
import { MOCK_ADDRESS } from '@/__tests__/helpers/ens.js'
import { runWalletBorrowPosition } from '@/commands/wallet/borrow/position.js'
import { __resetEnvCacheForTests } from '@/config/env.js'
import * as walletCtx from '@/context/walletContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

describe('runWalletBorrowPosition', () => {
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
    getPosition: (params: unknown) => Promise<unknown>,
    walletAddress = '0xabc',
    withBorrow = true,
  ) => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {
        borrow: { getPosition },
      } as never,
      signer: {} as never,
      wallet: {
        address: walletAddress,
        borrow: withBorrow
          ? {
              openPosition: async () => null,
              closePosition: async () => null,
              depositCollateral: async () => null,
              withdrawCollateral: async () => null,
              repay: async () => null,
            }
          : undefined,
        has: (n: string) => n === 'borrow' && withBorrow,
      } as never,
    })
  }

  it('passes wallet.address as the walletAddress and the resolved config as marketId', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return {
        marketId: {
          kind: 'morpho-blue',
          marketId: '0xdeadbeef',
          chainId: 84532,
        },
        collateralAsset: { metadata: { symbol: 'USDC_DEMO' } },
        collateralAmount: 100n,
        collateralAmountFormatted: '0.0001',
        borrowAsset: { metadata: { symbol: 'OP_DEMO' } },
        borrowAmount: 50n,
        borrowAmountFormatted: '5e-17',
        healthFactor: 2.5,
        liquidationPrice: 1234n,
        liquidationPriceFormatted: '0.001234',
        borrowApy: 0.05,
        liquidationBonus: 0.05,
        ltv: 0.4,
        maxLtv: 0.86,
      }
    }, MOCK_ADDRESS.toLowerCase())
    await runWalletBorrowPosition({ market: 'demo-dusdc-op' })
    const call = captured[0] as {
      marketId: { kind: string; chainId: number }
      walletAddress: string
    }
    expect(call.marketId.kind).toBe('morpho-blue')
    expect(call.marketId.chainId).toBe(84532)
    expect(call.walletAddress).toBe(MOCK_ADDRESS.toLowerCase())
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.healthFactor).toBe(2.5)
    expect(body.ltv).toBe(0.4)
  })

  it('rejects unknown markets with CliError(validation)', async () => {
    mockWallet(async () => ({}))
    try {
      await runWalletBorrowPosition({ market: 'no-such-market' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects with CliError(config) when wallet.borrow is undefined', async () => {
    mockWallet(async () => ({}), '0xabc', false)
    try {
      await runWalletBorrowPosition({ market: 'demo-dusdc-op' })
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
      await runWalletBorrowPosition({ market: 'demo-dusdc-op' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })
})
