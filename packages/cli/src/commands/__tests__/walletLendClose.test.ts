import { ContractFunctionRevertedError } from 'viem'
import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runWalletLendClose } from '@/commands/wallet/lend/close.js'
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
  blockNumber: 7n,
  gasUsed: 50000n,
})

describe('runWalletLendClose', () => {
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
    closePosition: (params: unknown) => Promise<unknown>,
    getPosition?: (params: unknown) => Promise<unknown>,
  ) => {
    vi.spyOn(walletCtx, 'walletContext').mockResolvedValue({
      config: getDemoConfig(),
      actions: {} as never,
      signer: {} as never,
      wallet: {
        address: '0xabc',
        lend: {
          closePosition,
          openPosition: async () => null,
          getPosition: getPosition ?? (async () => null),
        },
      } as never,
    })
  }

  it('emits a structured envelope with action=close and a one-tx array', async () => {
    const captured: unknown[] = []
    mockWallet(async (params) => {
      captured.push(params)
      return successReceipt('0xclose')
    })
    await runWalletLendClose({ market: 'aave-eth', amount: '0.25' })
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.action).toBe('close')
    expect(body.market.name).toBe('Aave ETH')
    expect(body.market.provider).toBe('aave')
    expect(body.asset.symbol).toBe('ETH')
    expect(body.amount).toBe(0.25)
    expect(body.transactions).toHaveLength(1)
    expect(body.transactions[0].transactionHash).toBe('0xclose')
    const call = captured[0] as {
      amount: number
      marketId: { chainId: number }
    }
    expect(call.amount).toBe(0.25)
    expect(call.marketId.chainId).toBe(11155420)
  })

  it('rejects unknown markets with CliError(validation)', async () => {
    mockWallet(async () => successReceipt('0x'))
    try {
      await runWalletLendClose({ market: 'no-such-market', amount: '1' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it.each([
    '0',
    '-1',
    'foo',
    'NaN',
    '1e10',
    '0x10',
    ' 1 ',
    '.5',
    '9007199254740993',
  ])('rejects amount %p with CliError(validation)', async (bad) => {
    mockWallet(async () => successReceipt('0x'))
    try {
      await runWalletLendClose({ market: 'aave-eth', amount: bad })
      throw new Error(`did not throw for ${bad}`)
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('maps simulation reverts to CliError(onchain)', async () => {
    mockWallet(async () => {
      throw new ContractFunctionRevertedError({
        abi: [],
        data: undefined,
        functionName: 'withdraw',
      })
    })
    try {
      await runWalletLendClose({ market: 'aave-eth', amount: '1' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('onchain')
    }
  })

  it('maps reverted receipts to CliError(onchain)', async () => {
    mockWallet(async () => ({
      ...successReceipt('0xrevert'),
      status: 'reverted' as const,
    }))
    try {
      await runWalletLendClose({ market: 'aave-eth', amount: '1' })
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
      await runWalletLendClose({ market: 'aave-eth', amount: '1' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
      expect((err as CliError).retryable).toBe(true)
    }
  })

  it('--max fetches the current position and uses balanceFormatted as the amount', async () => {
    const closeCalls: unknown[] = []
    const getPosition = vi.fn(async () => ({
      balanceFormatted: '0.42',
      balance: 420000000000000000n,
      sharesFormatted: '0.4',
      shares: 400000000000000000n,
      marketId: { address: '0xabc', chainId: 11155420 },
    }))
    mockWallet(async (params) => {
      closeCalls.push(params)
      return successReceipt('0xclose')
    }, getPosition)
    await runWalletLendClose({ market: 'aave-eth', max: true })
    expect(getPosition).toHaveBeenCalledTimes(1)
    const call = closeCalls[0] as { amount: number }
    expect(call.amount).toBe(0.42)
  })

  it('rejects --amount and --max together with CliError(validation)', async () => {
    // Statically rejected by `LendCloseFlags`; the runtime mutex check is
    // still needed because commander hands the handler a loosely-typed
    // object. Cast through `never` to exercise the runtime guard.
    mockWallet(async () => successReceipt('0x'))
    try {
      await runWalletLendClose({
        market: 'aave-eth',
        amount: '1',
        max: true,
      } as never)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/not both/)
    }
  })

  it('rejects close with neither --amount nor --max as CliError(validation)', async () => {
    mockWallet(async () => successReceipt('0x'))
    try {
      // Same: statically rejected, runtime guard exercised.
      await runWalletLendClose({ market: 'aave-eth' } as never)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('rejects with CliError(config) when PRIVATE_KEY is missing', async () => {
    delete process.env.PRIVATE_KEY
    __resetEnvCacheForTests()
    try {
      await runWalletLendClose({ market: 'aave-eth', amount: '1' })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
    }
  })
})
