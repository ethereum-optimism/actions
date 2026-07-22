import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '@/app.js'
import * as walletService from '@/services/wallet.js'

import { authHeaders, mockVerifiedUser } from './routeTestUtils.js'

vi.mock('@/services/wallet.js', () => ({
  getWallet: vi.fn(),
  getBorrowPosition: vi.fn(),
  getLendPosition: vi.fn(),
  getLendPositions: vi.fn(),
  getWalletBalance: vi.fn(),
  mintDemoUsdcToWallet: vi.fn(),
}))

vi.mock('@/services/swap.js', () => ({
  getMarkets: vi.fn(),
  getQuote: vi.fn(),
  executeSwap: vi.fn(),
}))

vi.mock('@/config/actions.js', () => ({
  initializeActions: vi.fn(),
  getActions: vi.fn(() => ({})),
  getPrivyClient: vi.fn(),
}))

vi.mock('@/middleware/actions.js', () => ({
  actionsMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next()
  },
}))

beforeEach(async () => {
  vi.resetAllMocks()
  await mockVerifiedUser('user-a')
})

describe('GET /wallet/lend/positions', () => {
  it('forwards multiple chain IDs to the SDK service', async () => {
    const wallet = { address: '0x' + 'a'.repeat(40) }
    vi.mocked(walletService.getWallet).mockResolvedValue(wallet as never)
    vi.mocked(walletService.getLendPositions).mockResolvedValue([])

    const res = await createApp().request(
      '/wallet/lend/positions?chainIds=84532,11155420&nonZeroOnly=true',
      { headers: authHeaders() },
    )

    expect(res.status).toBe(200)
    expect(walletService.getLendPositions).toHaveBeenCalledWith({
      wallet,
      params: {
        chainIds: [84532, 11155420],
        options: { nonZeroOnly: true },
      },
    })
  })

  it('rejects simultaneous single and multi-chain filters', async () => {
    const res = await createApp().request(
      '/wallet/lend/positions?chainId=84532&chainIds=84532,11155420',
      { headers: authHeaders() },
    )

    expect(res.status).toBe(400)
    expect(walletService.getLendPositions).not.toHaveBeenCalled()
  })
})

describe('POST /wallet/usdc', () => {
  it('requires authentication', async () => {
    const res = await createApp().request('/wallet/usdc', { method: 'POST' })

    expect(res.status).toBe(401)
  })

  it('does not apply the ETH faucet rate limit', async () => {
    vi.mocked(walletService.getWallet).mockResolvedValue({
      address: '0x' + 'e'.repeat(40),
    } as never)
    vi.mocked(walletService.mintDemoUsdcToWallet).mockResolvedValue({
      success: true,
    } as never)

    const app = createApp()
    const statuses: number[] = []
    for (let request = 0; request < 11; request++) {
      const res = await app.request('/wallet/usdc', {
        method: 'POST',
        headers: authHeaders(),
      })
      statuses.push(res.status)
    }

    expect(statuses).toEqual(Array(11).fill(200))
    expect(walletService.mintDemoUsdcToWallet).toHaveBeenCalledTimes(11)
  })
})

describe('JSON body-size cap', () => {
  it('rejects an oversized body before the handler runs', async () => {
    vi.mocked(walletService.getWallet).mockResolvedValue({
      address: '0x' + 'f'.repeat(40),
    } as never)
    vi.mocked(walletService.mintDemoUsdcToWallet).mockResolvedValue({
      success: true,
    } as never)

    const res = await createApp().request('/wallet/usdc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ junk: 'x'.repeat(20_000) }),
    })

    expect(res.status).toBe(413)
    expect(walletService.mintDemoUsdcToWallet).not.toHaveBeenCalled()
  })
})
