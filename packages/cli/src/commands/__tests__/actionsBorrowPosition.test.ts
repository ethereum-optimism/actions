import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runBorrowPosition } from '@/commands/actions/borrow/position.js'
import * as baseCtx from '@/context/baseContext.js'
import { getDemoConfig } from '@/demo/config.js'
import { CliError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

describe('runBorrowPosition (read-only, with --wallet)', () => {
  let writeSpy: MockInstance
  let stderrSpy: MockInstance

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockActions = (
    getPosition: (params: unknown) => Promise<unknown>,
    getAddress: (input: string) => Promise<string> = async () => VITALIK,
  ): void => {
    const config = getDemoConfig()
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: {
        ...config,
        chains: config.chains.filter((chain) => chain.chainId !== 1),
      },
      actions: { borrow: { getPosition }, ens: { getAddress } } as never,
    })
  }

  const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

  const samplePosition = () => ({
    marketId: {
      kind: 'morpho-blue',
      marketId: '0xdeadbeef',
      chainId: 84532,
    },
    collateralAsset: { metadata: { symbol: 'USDC_DEMO' } },
    collateralAmount: 1000n,
    collateralAmountFormatted: '0.001',
    borrowAsset: { metadata: { symbol: 'OP_DEMO' } },
    borrowAmount: 200n,
    borrowAmountFormatted: '0.0000000000000002',
    healthFactor: null,
    liquidationPrice: 0n,
    liquidationPriceFormatted: '0',
    borrowApy: 0.05,
    liquidationBonus: 0.05,
    ltv: null,
    maxLtv: 0.86,
  })

  it('checksums --wallet and forwards it to actions.borrow.getPosition', async () => {
    const captured: unknown[] = []
    mockActions(async (params) => {
      captured.push(params)
      return samplePosition()
    })
    // Lowercase address that needs checksum normalisation.
    await runBorrowPosition({
      market: 'demo-dusdc-op',
      wallet: VITALIK.toLowerCase(),
    })
    const call = captured[0] as {
      marketId: { kind: string; marketId: string; chainId: number }
      walletAddress: string
    }
    expect(call.marketId.kind).toBe('morpho-blue')
    expect(call.marketId.chainId).toBe(84532)
    // viem's getAddress() returns the EIP-55 checksum form.
    expect(call.walletAddress).toBe(VITALIK)
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body.healthFactor).toBeNull()
    expect(body.ltv).toBeNull()
  })

  it('resolves ENS --wallet before forwarding it to getPosition', async () => {
    const captured: unknown[] = []
    const ensInputs: string[] = []
    mockActions(
      async (params) => {
        captured.push(params)
        return samplePosition()
      },
      async (input) => {
        ensInputs.push(input)
        return VITALIK
      },
    )
    await runBorrowPosition({ market: 'demo-dusdc-op', wallet: 'vitalik.eth' })
    const call = captured[0] as { walletAddress: string }
    expect(ensInputs).toEqual(['vitalik.eth'])
    expect(call.walletAddress).toBe(VITALIK)
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('rejects a malformed --wallet address with CliError(validation)', async () => {
    mockActions(async () => samplePosition())
    try {
      await runBorrowPosition({
        market: 'demo-dusdc-op',
        wallet: 'not-an-address',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
      expect((err as CliError).message).toMatch(/Invalid --wallet/)
    }
  })

  it('rejects unknown markets with CliError(validation)', async () => {
    mockActions(async () => samplePosition())
    try {
      await runBorrowPosition({
        market: 'no-such-market',
        wallet: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('validation')
    }
  })

  it('maps RPC failures to CliError(network)', async () => {
    mockActions(async () => {
      throw new Error('HTTP request failed')
    })
    try {
      await runBorrowPosition({
        market: 'demo-dusdc-op',
        wallet: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      })
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('network')
      expect((err as CliError).retryable).toBe(true)
    }
  })
})
