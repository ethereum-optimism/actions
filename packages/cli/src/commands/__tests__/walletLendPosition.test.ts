import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runWalletLendPosition } from '@/commands/wallet/lend/position.js'
import { __resetEnvCacheForTests } from '@/config/env.js'
import * as walletCtx from '@/context/walletContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

const ANVIL_ACCOUNT_0 =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

describe('runWalletLendPosition', () => {
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
    withLend = true,
  ) => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0xabc',
        lend: withLend
          ? {
              getPosition,
              openPosition: async () => null,
              closePosition: async () => null,
            }
          : undefined,
      } as never,
    })
  }

  it('emits the SDK position shape verbatim with bigints stringified', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return {
        balance: 1234567n,
        balanceFormatted: '1.234567',
        shares: 1000000n,
        sharesFormatted: '1.0',
        marketId: { address: '0xabc', chainId: 84532 },
      }
    })
    await runWalletLendPosition({ market: 'gauntlet-usdc' })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.balance).toBe('1234567')
    expect(body.balanceFormatted).toBe('1.234567')
    expect(body.shares).toBe('1000000')
    expect(body.marketId.chainId).toBe(84532)
    const call = captured[0] as { marketId: { chainId: number } }
    expect(call.marketId.chainId).toBe(84532)
  })

  it('rejects unknown markets with CliError(validation)', async () => {
    mockWallet(async () => ({}))
    try {
      await runWalletLendPosition({ market: 'no-such-market' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects with CliError(config) when wallet.lend is undefined', async () => {
    mockWallet(async () => ({}), false)
    try {
      await runWalletLendPosition({ market: 'gauntlet-usdc' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })

  it('maps RPC failures to CliError(network)', async () => {
    mockWallet(async () => {
      throw new Error('HTTP request failed')
    })
    try {
      await runWalletLendPosition({ market: 'gauntlet-usdc' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
      expect((err as CliError).retryable).toBe(true)
    }
  })

  it('rejects with CliError(config) when PRIVATE_KEY is missing', async () => {
    delete process.env.PRIVATE_KEY
    __resetEnvCacheForTests()
    try {
      await runWalletLendPosition({ market: 'gauntlet-usdc' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })
})
