import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runWalletLendOpen } from '@/commands/wallet/lend/open.js'
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
  blockNumber: 1n,
  gasUsed: 21000n,
})

describe('runWalletLendOpen', () => {
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
    lendProviders: 'morpho' | 'aave' | 'both' = 'both',
  ) => {
    const lend =
      lendProviders === 'morpho' ||
      lendProviders === 'both' ||
      lendProviders === 'aave'
        ? { openPosition, closePosition: async () => null }
        : undefined
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0xabc',
        lend,
      } as never,
    })
  }

  it('emits a structured envelope with normalised array of receipts', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return [successReceipt('0xapprove'), successReceipt('0xposition')]
    })
    await runWalletLendOpen({ market: 'gauntlet-usdc', amount: '10' })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.action).toBe('open')
    expect(body.market.name).toBe('Gauntlet USDC')
    expect(body.market.provider).toBe('morpho')
    expect(body.asset.symbol).toBe('USDC_DEMO')
    expect(body.amount).toBe(10)
    expect(body.transactions).toHaveLength(2)
    expect(body.transactions[0].transactionHash).toBe('0xapprove')
    expect(body.transactions[1].transactionHash).toBe('0xposition')
    expect(body.transactions[0].blockNumber).toBe('1')
    expect(captured).toHaveLength(1)
    const call = captured[0] as {
      amount: number
      marketId: { chainId: number }
    }
    expect(call.amount).toBe(10)
    expect(call.marketId.chainId).toBe(84532)
  })

  it('wraps a single receipt into a one-element array', async () => {
    mockWallet(async () => successReceipt('0xonly'))
    await runWalletLendOpen({ market: 'aave-eth', amount: '0.5' })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.transactions).toHaveLength(1)
    expect(body.transactions[0].transactionHash).toBe('0xonly')
  })

  it('rejects unknown markets with CliError(validation)', async () => {
    mockWallet(async () => successReceipt('0x'))
    try {
      await runWalletLendOpen({ market: 'no-such-market', amount: '1' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects non-positive amounts with CliError(validation)', async () => {
    mockWallet(async () => successReceipt('0x'))
    for (const bad of ['0', '-1', 'foo', 'NaN']) {
      try {
        await runWalletLendOpen({ market: 'gauntlet-usdc', amount: bad })
        throw new Error(`did not throw for ${bad}`)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('validation')
      }
    }
  })

  it('maps reverted receipts to CliError(onchain)', async () => {
    mockWallet(async () => [
      successReceipt('0xapprove'),
      { ...successReceipt('0xrevert'), status: 'reverted' as const },
    ])
    try {
      await runWalletLendOpen({ market: 'gauntlet-usdc', amount: '1' })
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
      await runWalletLendOpen({ market: 'gauntlet-usdc', amount: '1' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
      expect((err as CliError).retryable).toBe(true)
    }
  })

  it('maps simulation reverts to CliError(onchain)', async () => {
    mockWallet(async () => {
      const e = new Error('execution reverted: ERC20: insufficient allowance')
      e.name = 'ContractFunctionRevertedError'
      throw e
    })
    try {
      await runWalletLendOpen({ market: 'gauntlet-usdc', amount: '1' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('onchain')
    }
  })

  it('rejects with CliError(config) when wallet.lend is undefined', async () => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {} as never,
      signer: {} as never,
      wallet: { address: '0xabc' } as never,
    })
    try {
      await runWalletLendOpen({ market: 'gauntlet-usdc', amount: '1' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })
})
