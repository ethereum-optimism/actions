import { beforeEach, describe, expect, it, vi } from 'vitest'

import { verbsApi, VerbsApiError } from './actionsApi'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock environment variables
vi.mock('../envVars', () => ({
  env: {
    VITE_VERBS_API_URL: 'https://api.test.com',
  },
}))

describe('VerbsApiClient', () => {
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

      const result = await verbsApi.createWallet('test-user')

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

    it('throws VerbsApiError on API failure', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Invalid user ID' }),
      }

      mockFetch.mockResolvedValue(mockErrorResponse)

      await expect(verbsApi.createWallet('invalid-user')).rejects.toThrow(
        VerbsApiError,
      )

      try {
        await verbsApi.createWallet('invalid-user')
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

      const result = await verbsApi.getAllWallets()

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

      const result = await verbsApi.getAllWallets()

      expect(result.wallets).toHaveLength(0)
      expect(result.count).toBe(0)
    })

    it('throws VerbsApiError on network error', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      }

      mockFetch.mockResolvedValue(mockErrorResponse)

      await expect(verbsApi.getAllWallets()).rejects.toThrow(VerbsApiError)

      try {
        await verbsApi.getAllWallets()
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
        await verbsApi.getAllWallets()
      } catch (error) {
        expect((error as Error).message).toBe('HTTP 404: Not Found')
      }
    })

    it('preserves status code in VerbsApiError', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ message: 'Access denied' }),
      }

      mockFetch.mockResolvedValue(mockErrorResponse)

      try {
        await verbsApi.getAllWallets()
      } catch (error) {
        expect(error).toBeInstanceOf(VerbsApiError)
        expect((error as VerbsApiError).status).toBe(403)
      }
    })
  })
})
