import { beforeEach, describe, expect, it, vi } from 'vitest'

import { actionsApi, ActionsApiError } from './actionsApi'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock environment variables
vi.mock('../envVars', () => ({
  env: {
    VITE_ACTIONS_API_URL: 'https://api.test.com',
  },
}))

describe('ActionsApiClient', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  describe('error handling', () => {
    it('handles JSON parsing errors gracefully', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.reject(new Error('Invalid JSON')),
      }

      mockFetch.mockResolvedValue(mockErrorResponse)

      try {
        await actionsApi.getMarkets()
      } catch (error) {
        expect((error as Error).message).toBe('HTTP 404: Not Found')
      }
    })

    it('preserves status code in ActionsApiError', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ message: 'Access denied' }),
      }

      mockFetch.mockResolvedValue(mockErrorResponse)

      try {
        await actionsApi.getMarkets()
      } catch (error) {
        expect(error).toBeInstanceOf(ActionsApiError)
        expect((error as ActionsApiError).status).toBe(403)
      }
    })
  })

  it('maps multi-chain filters and nested options to query parameters', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: [] }),
    })

    await actionsApi.getPositions({
      chainIds: [84532, 11155420],
      options: { nonZeroOnly: true },
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/wallet/lend/positions?chainIds=84532%2C11155420&nonZeroOnly=true',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('posts a wallet address to the provider-neutral faucet route', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: { userOpHash: '0xabc' } }),
    })
    const walletAddress = '0x2222222222222222222222222222222222222222'

    await actionsApi.dripEthToWallet(walletAddress)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/wallet/eth',
      expect.objectContaining({
        body: JSON.stringify({ walletAddress }),
        method: 'POST',
      }),
    )
  })
})
