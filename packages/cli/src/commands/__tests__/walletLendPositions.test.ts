import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANVIL_ACCOUNT_0 } from '@/__mocks__/anvilAccounts.js'
import { runWalletLendPositions } from '@/commands/wallet/lend/positions.js'
import { __resetEnvCacheForTests } from '@/config/env.js'
import * as walletCtx from '@/context/walletContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

describe('runWalletLendPositions', () => {
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
    getPositions: (params: unknown) => Promise<unknown>,
    withLend = true,
  ) => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0xabc',
        lend: withLend ? { getPositions } : undefined,
        has(namespace: 'lend' | 'swap') {
          return namespace === 'lend' && withLend
        },
      } as never,
    })
  }

  it('emits the array of positions with bigints stringified', async () => {
    mockWallet(async () => [
      {
        balance: 1234567n,
        balanceFormatted: '1.234567',
        shares: 1000000n,
        sharesFormatted: '1.0',
        marketId: { address: '0xabc', chainId: 84532 },
      },
    ])
    await runWalletLendPositions()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toHaveLength(1)
    expect(body[0].balance).toBe('1234567')
    expect(body[0].shares).toBe('1000000')
    expect(body[0].marketId.chainId).toBe(84532)
  })

  it('forwards --chain and --non-zero-only to the SDK', async () => {
    const getPositions = vi.fn(async () => [])
    mockWallet(getPositions)
    await runWalletLendPositions({ chain: 'base-sepolia', nonZeroOnly: true })
    expect(getPositions).toHaveBeenCalledWith({
      chainId: 84532,
      nonZeroOnly: true,
    })
  })

  it('passes undefined chainId when no chain flag is set', async () => {
    const getPositions = vi.fn(async () => [])
    mockWallet(getPositions)
    await runWalletLendPositions()
    expect(getPositions).toHaveBeenCalledWith({
      chainId: undefined,
      nonZeroOnly: undefined,
    })
  })

  it('rejects multi-chain --chain values with CliError(validation)', async () => {
    mockWallet(async () => [])
    try {
      await runWalletLendPositions({ chain: 'base-sepolia,op-sepolia' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/single chain/)
    }
  })

  it('rejects with CliError(config) when wallet.lend is undefined', async () => {
    mockWallet(async () => [], false)
    try {
      await runWalletLendPositions()
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
      await runWalletLendPositions()
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
      expect((err as CliError).retryable).toBe(true)
    }
  })
})
