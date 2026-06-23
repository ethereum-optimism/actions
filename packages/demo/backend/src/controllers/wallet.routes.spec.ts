import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '@/app.js'
import * as faucetService from '@/services/faucet.js'
import * as swapService from '@/services/swap.js'
import * as walletService from '@/services/wallet.js'

vi.mock('@/services/wallet.js', () => ({
  getWallet: vi.fn(),
  getBorrowPosition: vi.fn(),
  getLendPosition: vi.fn(),
  getWalletBalance: vi.fn(),
  mintDemoUsdcToWallet: vi.fn(),
}))

// Keep the real per-recipient accounting (reserveDrip / releaseDrip) so the
// TOCTOU gate is exercised end-to-end; only the network-touching calls are
// stubbed.
vi.mock('@/services/faucet.js', async (importOriginal) => {
  const actual = await importOriginal<typeof faucetService>()
  return {
    ...actual,
    isWalletEligibleForFaucet: vi.fn(),
    dripEthToWallet: vi.fn(),
  }
})

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

function authHeaders() {
  return {
    Authorization: 'Bearer fake-access-token',
    'privy-id-token': 'fake-id-token',
  }
}

const okDrip = { success: true, userOpHash: '0x' + 'd'.repeat(64) }

beforeEach(async () => {
  vi.resetAllMocks()
  const { getPrivyClient } = await import('@/config/actions.js')
  vi.mocked(getPrivyClient).mockReturnValue({
    utils: () => ({
      auth: () => ({ verifyAuthToken: vi.fn().mockResolvedValue(undefined) }),
    }),
  } as never)
})

describe('POST /wallet/eth (faucet drip)', () => {
  it('rejects an unauthenticated request and signs no drip', async () => {
    const res = await createApp().request('/wallet/eth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: '0x' + '1'.repeat(40) }),
    })
    expect(res.status).toBe(401)
    expect(faucetService.dripEthToWallet).not.toHaveBeenCalled()
  })

  it('keeps every /wallet/* mutation in the auth-gated set', async () => {
    for (const path of ['/wallet/eth', '/wallet/usdc']) {
      const res = await createApp().request(path, { method: 'POST' })
      expect(res.status, `${path} must require auth`).toBe(401)
    }
  })

  it('drips only to the session wallet, ignoring any body walletAddress', async () => {
    const sessionWallet = '0x' + 'a'.repeat(40)
    const attackerWallet = '0x' + 'b'.repeat(40)
    vi.mocked(walletService.getWallet).mockResolvedValue({
      address: sessionWallet,
    } as never)
    vi.mocked(faucetService.isWalletEligibleForFaucet).mockResolvedValue(true)
    vi.mocked(faucetService.dripEthToWallet).mockResolvedValue(okDrip as never)

    const res = await createApp().request('/wallet/eth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ walletAddress: attackerWallet }),
    })

    expect(res.status).toBe(200)
    expect(faucetService.dripEthToWallet).toHaveBeenCalledTimes(1)
    expect(faucetService.dripEthToWallet).toHaveBeenCalledWith(sessionWallet)
  })

  it('returns 404 when the session resolves to no wallet', async () => {
    vi.mocked(walletService.getWallet).mockResolvedValue(null as never)
    const res = await createApp().request('/wallet/eth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(404)
    expect(faucetService.dripEthToWallet).not.toHaveBeenCalled()
  })

  it('drips at most once under N concurrent requests for one fresh wallet (TOCTOU)', async () => {
    const freshWallet = '0x' + 'c'.repeat(40)
    vi.mocked(walletService.getWallet).mockResolvedValue({
      address: freshWallet,
    } as never)
    vi.mocked(faucetService.isWalletEligibleForFaucet).mockResolvedValue(true)
    vi.mocked(faucetService.dripEthToWallet).mockResolvedValue(okDrip as never)

    const app = createApp()
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.request('/wallet/eth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({}),
        }),
      ),
    )

    const statuses = responses.map((r) => r.status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(1)
    expect(statuses.filter((s) => s === 429)).toHaveLength(5)
    expect(faucetService.dripEthToWallet).toHaveBeenCalledTimes(1)
  })
})

describe('rate limiting on fund-touching routes', () => {
  it('caps a /wallet/usdc burst at the limit and 429s the rest without minting', async () => {
    vi.mocked(walletService.getWallet).mockResolvedValue({
      address: '0x' + 'e'.repeat(40),
    } as never)
    vi.mocked(walletService.mintDemoUsdcToWallet).mockResolvedValue({
      success: true,
    } as never)

    const app = createApp()
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      const res = await app.request('/wallet/usdc', {
        method: 'POST',
        headers: authHeaders(),
      })
      statuses.push(res.status)
    }

    expect(statuses.filter((s) => s === 200)).toHaveLength(10)
    expect(statuses[10]).toBe(429)
    expect(walletService.mintDemoUsdcToWallet).toHaveBeenCalledTimes(10)
  })

  it('caps a /swap/execute burst at the limit and 429s the rest', async () => {
    vi.mocked(swapService.executeSwap).mockResolvedValue({ ok: true } as never)
    const body = JSON.stringify({
      amountIn: 1,
      tokenInAddress: '0x' + 'a'.repeat(40),
      tokenOutAddress: '0x' + 'b'.repeat(40),
      chainId: 84532,
    })

    const app = createApp()
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      const res = await app.request('/swap/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body,
      })
      statuses.push(res.status)
    }

    expect(statuses.filter((s) => s === 200)).toHaveLength(10)
    expect(statuses[10]).toBe(429)
    expect(swapService.executeSwap).toHaveBeenCalledTimes(10)
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
