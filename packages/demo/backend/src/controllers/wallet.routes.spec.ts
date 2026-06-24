import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '@/app.js'
import * as faucetService from '@/services/faucet.js'
import * as walletService from '@/services/wallet.js'

import { authHeaders, mockVerifiedUser } from './routeTestUtils.js'

vi.mock('@/services/wallet.js', () => ({
  getWallet: vi.fn(),
  getBorrowPosition: vi.fn(),
  getLendPosition: vi.fn(),
  getWalletBalance: vi.fn(),
  mintDemoUsdcToWallet: vi.fn(),
}))

// Keep real per-recipient accounting; stub only network-touching calls.
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

const okDrip = { success: true, userOpHash: '0x' + 'd'.repeat(64) }

beforeEach(async () => {
  vi.resetAllMocks()
  await mockVerifiedUser('user-a')
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

  it('releases the drip reservation when submission returns unsuccessful', async () => {
    await mockVerifiedUser('user-drip-unsuccessful')
    const retryWallet = '0x' + '7'.repeat(40)
    vi.mocked(walletService.getWallet).mockResolvedValue({
      address: retryWallet,
    } as never)
    vi.mocked(faucetService.isWalletEligibleForFaucet).mockResolvedValue(true)
    vi.mocked(faucetService.dripEthToWallet)
      .mockResolvedValueOnce({ success: false } as never)
      .mockResolvedValueOnce(okDrip as never)

    const app = createApp()
    const failed = await app.request('/wallet/eth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    })
    const retried = await app.request('/wallet/eth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    })

    expect(failed.status).toBe(500)
    expect(retried.status).toBe(200)
    expect(faucetService.dripEthToWallet).toHaveBeenCalledTimes(2)
  })

  it('releases the drip reservation when submission rejects', async () => {
    await mockVerifiedUser('user-drip-reject')
    const retryWallet = '0x' + '8'.repeat(40)
    vi.mocked(walletService.getWallet).mockResolvedValue({
      address: retryWallet,
    } as never)
    vi.mocked(faucetService.isWalletEligibleForFaucet).mockResolvedValue(true)
    vi.mocked(faucetService.dripEthToWallet)
      .mockRejectedValueOnce(new Error('bundler down'))
      .mockResolvedValueOnce(okDrip as never)

    const app = createApp()
    const failed = await app.request('/wallet/eth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    })
    const retried = await app.request('/wallet/eth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    })

    expect(failed.status).toBe(500)
    expect(retried.status).toBe(200)
    expect(faucetService.dripEthToWallet).toHaveBeenCalledTimes(2)
  })

  it('rate-limits repeated faucet drips for one verified user before drip submission', async () => {
    await mockVerifiedUser('user-faucet-limit')
    let walletIndex = 0
    vi.mocked(walletService.getWallet).mockImplementation(async () => {
      walletIndex += 1
      return {
        address: `0x${walletIndex.toString(16).padStart(40, '0')}`,
      } as never
    })
    vi.mocked(faucetService.isWalletEligibleForFaucet).mockResolvedValue(true)
    vi.mocked(faucetService.dripEthToWallet).mockResolvedValue(okDrip as never)

    const app = createApp()
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      const res = await app.request('/wallet/eth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({}),
      })
      statuses.push(res.status)
    }

    expect(statuses.filter((s) => s === 200)).toHaveLength(10)
    expect(statuses[10]).toBe(429)
    expect(faucetService.dripEthToWallet).toHaveBeenCalledTimes(10)
  })

  it('does not rate-limit the USDC demo mint route', async () => {
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
