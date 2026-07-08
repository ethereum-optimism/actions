import { MarketNotAllowedError } from '@eth-optimism/actions-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '@/app.js'
import { WalletNotFoundError } from '@/helpers/errors.js'
import * as lendService from '@/services/lend.js'

vi.mock('@/services/lend.js', () => ({
  getMarkets: vi.fn(),
  getMarket: vi.fn(),
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

const MARKET = {
  address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9',
  chainId: 130,
}

function authHeaders() {
  return {
    Authorization: 'Bearer fake-access-token',
    'privy-id-token': 'fake-id-token',
  }
}

beforeEach(async () => {
  vi.resetAllMocks()
  const { getPrivyClient } = await import('@/config/actions.js')
  vi.mocked(getPrivyClient).mockReturnValue({
    utils: () => ({
      auth: () => ({ verifyAuthToken: vi.fn().mockResolvedValue(undefined) }),
    }),
  } as never)
})

describe('lend routes error mapping via global onError', () => {
  it('maps a thrown SDK error from GET /lend/markets to its status', async () => {
    vi.mocked(lendService.getMarkets).mockRejectedValue(
      new MarketNotAllowedError({
        address: '0xabc',
        chainId: 84532,
        reason: 'leaky internal detail',
      }),
    )
    const res = await createApp().request('/lend/markets')
    expect(res.status).toBe(403)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Market is not in the allowlist.')
    // Internal reason must not leak through onError.
    expect(json.error).not.toContain('leaky')
  })

  it('maps WalletNotFoundError from POST /lend/position/open to 404', async () => {
    vi.mocked(lendService.openPosition).mockRejectedValue(
      new WalletNotFoundError(),
    )
    const res = await createApp().request('/lend/position/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        amount: 500,
        tokenAddress: 'native',
        marketId: MARKET,
      }),
    })
    expect(res.status).toBe(404)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Wallet not found.')
  })

  it('maps WalletNotFoundError from POST /lend/position/close to 404', async () => {
    vi.mocked(lendService.closePosition).mockRejectedValue(
      new WalletNotFoundError(),
    )
    const res = await createApp().request('/lend/position/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        amount: 500,
        tokenAddress: 'native',
        marketId: MARKET,
      }),
    })
    expect(res.status).toBe(404)
  })

  it('returns a generic 500 when the thrown error is unmapped', async () => {
    vi.mocked(lendService.getMarkets).mockRejectedValue(
      new Error('boom: secret internal detail'),
    )
    const res = await createApp().request('/lend/markets')
    expect(res.status).toBe(500)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Internal server error')
    expect(json.error).not.toContain('secret')
  })
})
