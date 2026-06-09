/**
 * Shared HTTP foundation for the demo's API clients. `BaseApiClient.request`
 * is a `fetch` wrapper that adds the JSON content-type, applies a per-call
 * timeout, and raises `ActionsApiError` on non-2xx.
 */

import { env } from '../envVars.js'

export class ActionsApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ActionsApiError'
    this.status = status
  }
}

// Reads get a short timeout; mutations get a longer ceiling for settlement.
export const READ_TIMEOUT_MS = 8_000
export const MUTATION_TIMEOUT_MS = 30_000

export class BaseApiClient {
  protected baseUrl = env.VITE_ACTIONS_API_URL

  protected async request<T>(
    endpoint: string,
    options: RequestInit & { timeoutMs?: number } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const { headers, timeoutMs = READ_TIMEOUT_MS, signal, ...rest } = options

    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      ...rest,
      signal: combinedSignal,
    })

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorData.message || errorMessage
      } catch {
        // body wasn't JSON; keep the status-line message
      }
      throw new ActionsApiError(errorMessage, response.status)
    }

    return (await response.json()) as T
  }
}
