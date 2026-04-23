import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runWalletBalance } from '@/commands/wallet/balance.js'
import { __resetEnvCacheForTests } from '@/config/env.js'
import * as walletCtx from '@/context/walletContext.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

const ANVIL_ACCOUNT_0 =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

describe('runWalletBalance', () => {
  const originalEnv = process.env
  let writeSpy: MockInstance

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.PRIVATE_KEY
    __resetEnvCacheForTests()
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    process.env = originalEnv
    __resetEnvCacheForTests()
    vi.restoreAllMocks()
  })

  const mockWallet = (getBalance: () => Promise<unknown>) => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: { chains: [] } as never,
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0x0',
        getBalance,
      } as never,
    })
  }

  it('emits the balance array with bigints serialised as strings', async () => {
    process.env.PRIVATE_KEY = ANVIL_ACCOUNT_0
    mockWallet(async () => [
      {
        asset: { metadata: { symbol: 'ETH' } },
        totalBalance: 0.0001,
        totalBalanceRaw: 100000000000000n,
        chains: { 84532: { balance: 0.0001, balanceRaw: 100000000000000n } },
      },
    ])
    await runWalletBalance()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body[0].totalBalanceRaw).toBe('100000000000000')
    expect(body[0].chains['84532'].balanceRaw).toBe('100000000000000')
  })

  it('preserves precision for large bigint balances', async () => {
    process.env.PRIVATE_KEY = ANVIL_ACCOUNT_0
    mockWallet(async () => [
      {
        asset: { metadata: { symbol: 'USDC' } },
        totalBalance: 0,
        totalBalanceRaw: 1234567890123456789n,
        chains: {},
      },
    ])
    await runWalletBalance()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body[0].totalBalanceRaw).toBe('1234567890123456789')
  })

  it('classifies RPC failures as retryable network errors', async () => {
    process.env.PRIVATE_KEY = ANVIL_ACCOUNT_0
    mockWallet(async () => {
      throw new Error('HTTP request failed. Status: ECONNREFUSED')
    })
    try {
      await runWalletBalance()
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
      expect((err as CliError).retryable).toBe(true)
    }
  })

  it('rejects with CliError(config) when PRIVATE_KEY is missing', async () => {
    try {
      await runWalletBalance()
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })

  it('filters balances to a single chain via --chain', async () => {
    process.env.PRIVATE_KEY = ANVIL_ACCOUNT_0
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: { chains: [{ chainId: 84532 }, { chainId: 11155420 }] } as never,
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0x0',
        getBalance: async () => [
          {
            asset: { metadata: { symbol: 'ETH' } },
            totalBalance: 3,
            totalBalanceRaw: 3n,
            chains: {
              84532: { balance: 1, balanceRaw: 1n },
              11155420: { balance: 2, balanceRaw: 2n },
            },
          },
        ],
      } as never,
    })
    await runWalletBalance({ chain: 'base-sepolia' })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(Object.keys(body[0].chains)).toEqual(['84532'])
    expect(body[0].totalBalanceRaw).toBe('1')
  })

  it('rejects when both --chain and --chain-id are set', async () => {
    process.env.PRIVATE_KEY = ANVIL_ACCOUNT_0
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: { chains: [{ chainId: 84532 }] } as never,
      actions: {} as never,
      signer: {} as never,
      wallet: { address: '0x0', getBalance: async () => [] } as never,
    })
    try {
      await runWalletBalance({ chain: 'base-sepolia', chainId: '84532' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })
})
