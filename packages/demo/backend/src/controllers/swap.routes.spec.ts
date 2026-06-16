import {
  ExactOutputNotSupportedError,
  ProviderNotConfiguredError,
  SameAssetError,
  SlippageOutOfRangeError,
} from '@eth-optimism/actions-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '@/app.js'
import { WalletNotFoundError } from '@/helpers/errors.js'
import * as swapService from '@/services/swap.js'

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

const TOKEN_IN = '0x1111111111111111111111111111111111111111'
const TOKEN_OUT = '0x2222222222222222222222222222222222222222'
const CHAIN_ID = 84532

function authHeaders() {
  return {
    Authorization: 'Bearer fake-access-token',
    'privy-id-token': 'fake-id-token',
  }
}

function executeBody() {
  return JSON.stringify({
    amountIn: 100,
    tokenInAddress: TOKEN_IN,
    tokenOutAddress: TOKEN_OUT,
    chainId: CHAIN_ID,
  })
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

describe('swap routes error mapping via global onError', () => {
  it('maps WalletNotFoundError from POST /swap/execute to 404', async () => {
    vi.mocked(swapService.executeSwap).mockRejectedValue(
      new WalletNotFoundError(),
    )
    const res = await createApp().request('/swap/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: executeBody(),
    })
    expect(res.status).toBe(404)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Wallet not found.')
  })

  it('maps ProviderNotConfiguredError from POST /swap/execute to 500', async () => {
    vi.mocked(swapService.executeSwap).mockRejectedValue(
      new ProviderNotConfiguredError({
        provider: 'swap',
        details: 'Swap namespace is not enabled on this wallet.',
      }),
    )
    const res = await createApp().request('/swap/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: executeBody(),
    })
    expect(res.status).toBe(500)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Provider not configured for this market.')
    // The wallet-specific detail must not leak to the client.
    expect(json.error).not.toContain('namespace')
  })

  it('maps SameAssetError from GET /swap/markets to 400', async () => {
    vi.mocked(swapService.getMarkets).mockRejectedValue(
      new SameAssetError('USDC'),
    )
    const res = await createApp().request(`/swap/markets?chainId=${CHAIN_ID}`)
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Cannot swap an asset for itself.')
  })

  it('maps SlippageOutOfRangeError from GET /swap/quote to 400', async () => {
    vi.mocked(swapService.getQuote).mockRejectedValue(
      new SlippageOutOfRangeError(0.9, 0.5),
    )
    const res = await createApp().request(
      `/swap/quote?tokenInAddress=${TOKEN_IN}&tokenOutAddress=${TOKEN_OUT}&chainId=${CHAIN_ID}&amountIn=100`,
    )
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Slippage is out of the allowed range.')
  })

  it('maps ExactOutputNotSupportedError from GET /swap/quote to 400', async () => {
    vi.mocked(swapService.getQuote).mockRejectedValue(
      new ExactOutputNotSupportedError('uniswap'),
    )
    const res = await createApp().request(
      `/swap/quote?tokenInAddress=${TOKEN_IN}&tokenOutAddress=${TOKEN_OUT}&chainId=${CHAIN_ID}&amountOut=0.5`,
    )
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe(
      'Exact-output swaps are not supported by this provider.',
    )
  })

  it('returns a generic 500 when the thrown error is unmapped', async () => {
    vi.mocked(swapService.getMarkets).mockRejectedValue(
      new Error('boom: secret internal detail'),
    )
    const res = await createApp().request(`/swap/markets?chainId=${CHAIN_ID}`)
    expect(res.status).toBe(500)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Internal server error')
    expect(json.error).not.toContain('secret')
  })
})
