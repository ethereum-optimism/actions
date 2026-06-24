import { MarketNotAllowedError } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '@/app.js'
import * as borrowService from '@/services/borrow.js'
import * as lendService from '@/services/lend.js'
import * as walletService from '@/services/wallet.js'

import { authHeaders, mockVerifiedUser } from './routeTestUtils.js'

vi.mock('@hono/node-server/conninfo', () => ({
  getConnInfo: vi.fn((c: Pick<Context, 'req'>) => ({
    remote: {
      address: c.req.header('x-test-remote-address') ?? '127.0.0.1',
    },
  })),
}))

vi.mock('@/services/borrow.js', () => ({
  getMarkets: vi.fn(),
  getQuote: vi.fn(),
  openPosition: vi.fn(),
  closePosition: vi.fn(),
  depositCollateral: vi.fn(),
  withdrawCollateral: vi.fn(),
  repay: vi.fn(),
  resolveMarketConfig: vi.fn(),
}))

vi.mock('@/services/wallet.js', () => ({
  getWallet: vi.fn(),
  getBorrowPosition: vi.fn(),
  getLendPosition: vi.fn(),
  getWalletBalance: vi.fn(),
  mintDemoUsdcToWallet: vi.fn(),
}))

vi.mock('@/services/faucet.js', () => ({
  isWalletEligibleForFaucet: vi.fn(),
  dripEthToWallet: vi.fn(),
}))

vi.mock('@/services/assets.js', () => ({
  getAssets: vi.fn(),
}))

vi.mock('@/services/swap.js', () => ({
  getMarkets: vi.fn(),
  getQuote: vi.fn(),
  executeSwap: vi.fn(),
}))

vi.mock('@/services/lend.js', () => ({
  getMarkets: vi.fn(),
  openPosition: vi.fn(),
  closePosition: vi.fn(),
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

const MARKET_ID = {
  kind: 'morpho-blue' as const,
  chainId: 84532,
  marketId: '0x' + 'a'.repeat(64),
}
const LEND_MARKET_ID = {
  address: '0x' + 'b'.repeat(40),
  chainId: 84532,
}
const WALLET = '0xaabbccddeeff00112233445566778899aabbccdd'

function authHeadersForAttempt(attempt: number) {
  return {
    'Content-Type': 'application/json',
    ...authHeaders(),
    'x-test-remote-address': `198.51.100.${attempt}`,
  }
}

async function burstMutation(path: string, body: unknown) {
  const app = createApp()
  const statuses: number[] = []
  for (let i = 0; i < 11; i++) {
    const res = await app.request(path, {
      method: 'POST',
      headers: authHeadersForAttempt(i),
      body: JSON.stringify(body),
    })
    statuses.push(res.status)
  }
  return statuses
}

beforeEach(async () => {
  vi.resetAllMocks()
  await mockVerifiedUser('user-a')
})

describe('borrow routes', () => {
  describe('GET /borrow/markets', () => {
    it('returns 200 without auth', async () => {
      vi.mocked(borrowService.getMarkets).mockResolvedValue([])
      const res = await createApp().request('/borrow/markets')
      expect(res.status).toBe(200)
    })
  })

  describe('POST /borrow/quote', () => {
    it('returns 401 without auth headers', async () => {
      const res = await createApp().request('/borrow/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open',
          marketId: MARKET_ID,
          borrowAmount: { amountRaw: '1' },
        }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 400 when the body includes walletAddress (strict schema)', async () => {
      vi.mocked(walletService.getWallet).mockResolvedValue({
        address: WALLET,
      } as never)
      const res = await createApp().request('/borrow/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          action: 'open',
          marketId: MARKET_ID,
          borrowAmount: { amountRaw: '1' },
          walletAddress: WALLET,
        }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 404 when the auth idToken has no wallet', async () => {
      vi.mocked(walletService.getWallet).mockResolvedValue(null as never)
      const res = await createApp().request('/borrow/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          action: 'open',
          marketId: MARKET_ID,
          borrowAmount: { amountRaw: '1' },
        }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /borrow/position/open', () => {
    it('returns 401 without auth headers', async () => {
      const res = await createApp().request('/borrow/position/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId: MARKET_ID,
          borrowAmount: { amountRaw: '1' },
        }),
      })
      expect(res.status).toBe(401)
    })

    it('forwards idToken and resolved body to the service on happy path', async () => {
      vi.mocked(borrowService.openPosition).mockResolvedValue({
        blockExplorerUrls: [],
      } as never)
      const res = await createApp().request('/borrow/position/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          marketId: MARKET_ID,
          borrowAmount: { amountRaw: '1' },
        }),
      })
      expect(res.status).toBe(200)
      expect(borrowService.openPosition).toHaveBeenCalledWith(
        expect.objectContaining({ idToken: 'fake-id-token' }),
      )
    })

    it('returns 400 on a malformed body', async () => {
      const res = await createApp().request('/borrow/position/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ nothing: 'here' }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe('post-auth mutation rate limiting', () => {
    it('caps /lend/position/open by verified user before the handler runs', async () => {
      await mockVerifiedUser('user-lend-limit')
      vi.mocked(lendService.openPosition).mockResolvedValue({
        blockExplorerUrls: [],
      } as never)

      const statuses = await burstMutation('/lend/position/open', {
        amount: 1,
        tokenAddress: 'native',
        marketId: LEND_MARKET_ID,
      })

      expect(statuses.filter((s) => s === 200)).toHaveLength(10)
      expect(statuses[10]).toBe(429)
      expect(lendService.openPosition).toHaveBeenCalledTimes(10)
    })

    it('caps /borrow/position/open by verified user before the handler runs', async () => {
      await mockVerifiedUser('user-borrow-limit')
      vi.mocked(borrowService.openPosition).mockResolvedValue({
        blockExplorerUrls: [],
      } as never)

      const statuses = await burstMutation('/borrow/position/open', {
        marketId: MARKET_ID,
        borrowAmount: { amountRaw: '1' },
      })

      expect(statuses.filter((s) => s === 200)).toHaveLength(10)
      expect(statuses[10]).toBe(429)
      expect(borrowService.openPosition).toHaveBeenCalledTimes(10)
    })
  })

  describe('borrow-scoped onError', () => {
    it('maps a thrown SDK error to its status via mapSdkError', async () => {
      vi.mocked(borrowService.getMarkets).mockRejectedValue(
        new MarketNotAllowedError({
          address: '0xabc',
          chainId: 84532,
          reason: 'leaky internal detail',
        }),
      )
      const res = await createApp().request('/borrow/markets')
      expect(res.status).toBe(403)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('Market is not in the allowlist.')
    })

    it('returns a generic 500 when the SDK error class is not mapped', async () => {
      vi.mocked(borrowService.getMarkets).mockRejectedValue(
        new Error('something unmapped'),
      )
      const res = await createApp().request('/borrow/markets')
      expect(res.status).toBe(500)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('Internal server error')
      expect(json.error).not.toContain('unmapped')
    })

    it('leaves non-borrow paths to their per-route try/catch (no mapping)', async () => {
      // Lend's controller has its own try/catch that turns errors into a
      // per-verb generic 500 with a domain-specific message. The borrow-scoped
      // onError must not intercept it; mapSdkError would otherwise turn this
      // into a 403 and silently change lend's contract.
      const { getMarkets: lendGetMarkets } = await import('@/services/lend.js')
      vi.mocked(lendGetMarkets).mockRejectedValue(
        new MarketNotAllowedError({
          address: '0xabc',
          chainId: 84532,
          reason: 'lend-side',
        }),
      )
      const res = await createApp().request('/lend/markets')
      expect(res.status).toBe(500)
      const json = (await res.json()) as { error: string }
      expect(json.error).not.toBe('Market is not in the allowlist.')
    })
  })
})
