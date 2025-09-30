/**
 * Retry a read operation to mitigate eventual consistency/race conditions
 * @description Useful for onchain reads that may temporarily return stale data
 * right after a write (e.g., before state is propagated to the queried node).
 * The read function is invoked, and if the result is deemed stale by the
 * provided predicate (or the read throws), it waits and retries up to `retries` times.
 */
export async function retryOnStaleRead<T>(
  read: () => Promise<T>,
  isStale: (value: T) => boolean,
  options?: {
    /** Number of retry attempts if the result is stale. Default: 1 */
    retries?: number
    /** Delay in milliseconds between attempts. Default: 2000 */
    delayMs?: number
  },
): Promise<T> {
  const retries = options?.retries ?? 1
  const delayMs = options?.delayMs ?? 2000

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt === retries) {
      break
    }

    try {
      const result = await read()
      if (!isStale(result)) return result
    } catch {
      // Treat errors as potentially stale reads; retry below
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  // Final attempt already performed and was stale; perform one last read to return whatever it is
  // to the caller (stale or not), so the caller can decide what to do.
  return await read()
}
