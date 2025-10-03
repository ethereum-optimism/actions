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

  describe('createWallet', () => {
    it('makes correct API call for wallet creation', async () => {
      const mockResponse = {
        address: '0x1234567890123456789012345678901234567890',
        userId: 'test-user',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await actionsApi.createWallet('test-user')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/wallet/test-user',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
      expect(result).toEqual(mockResponse)
    })

    it('throws ActionsApiError on API failure', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Invalid user ID' }),
      }

      mockFetch.mockResolvedValue(mockErrorResponse)

      await expect(actionsApi.createWallet('invalid-user')).rejects.toThrow(
        ActionsApiError,
      )

      try {
        await actionsApi.createWallet('invalid-user')
      } catch (error) {
        expect((error as Error).message).toBe('Invalid user ID')
      }
    })
  })

  describe('getAllWallets', () => {
    it('makes correct API call for getting all wallets', async () => {
      const mockResponse = {
        wallets: [
          { address: '0x1234567890123456789012345678901234567890' },
          { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
        ],
        count: 2,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await actionsApi.getAllWallets()

      expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/wallets', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      expect(result).toEqual(mockResponse)
    })

    it('handles empty wallet list', async () => {
      const mockResponse = {
        wallets: [],
        count: 0,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await actionsApi.getAllWallets()

      expect(result.wallets).toHaveLength(0)
      expect(result.count).toBe(0)
    })

    it('throws ActionsApiError on network error', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      }

      mockFetch.mockResolvedValue(mockErrorResponse)

      await expect(actionsApi.getAllWallets()).rejects.toThrow(ActionsApiError)

      try {
        await actionsApi.getAllWallets()
      } catch (error) {
        expect((error as Error).message).toBe('HTTP 500: Internal Server Error')
      }
    })
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
        await actionsApi.getAllWallets()
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
        await actionsApi.getAllWallets()
      } catch (error) {
        expect(error).toBeInstanceOf(ActionsApiError)
        expect((error as ActionsApiError).status).toBe(403)
      }
    })
  })
})
