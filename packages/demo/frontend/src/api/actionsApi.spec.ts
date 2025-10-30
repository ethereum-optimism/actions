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
})
