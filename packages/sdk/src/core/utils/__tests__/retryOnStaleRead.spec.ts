import { describe, expect, it, vi } from 'vitest'

import { retryOnStaleRead } from '@/core/utils/retryOnStaleRead.js'

describe('retryOnStaleRead', () => {
  it('returns immediately when value is fresh', async () => {
    const read = vi.fn().mockResolvedValue(42)
    const isStale = (v: number) => v < 0

    const result = await retryOnStaleRead(read, isStale)

    expect(result).toBe(42)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('retries once after delay and returns fresh value', async () => {
    vi.useFakeTimers()

    const read = vi
      .fn<[], Promise<number>>()
      .mockResolvedValueOnce(-1) // stale
      .mockResolvedValueOnce(7) // fresh
    const isStale = (v: number) => v === -1

    const delayMs = 2000
    const retries = 1
    const promise = retryOnStaleRead(read, isStale, { retries, delayMs: 2000 })

    await vi.advanceTimersByTimeAsync(delayMs * (retries + 1))
    const result = await promise

    expect(read).toHaveBeenCalledTimes(2)
    expect(result).toBe(7)

    vi.useRealTimers()
  })

  it('after all retries, returns last read value even if stale', async () => {
    vi.useFakeTimers()

    const read = vi.fn().mockResolvedValue(-1)
    const isStale = (v: number) => v === -1

    const delayMs = 1000
    const retries = 2
    const promise = retryOnStaleRead(read, isStale, { retries, delayMs: 1000 })

    await vi.advanceTimersByTimeAsync(delayMs * (retries + 1))
    const result = await promise

    expect(read).toHaveBeenCalledTimes(3)
    expect(result).toBe(-1)

    vi.useRealTimers()
  })
})
