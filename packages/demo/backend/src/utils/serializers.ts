/**
 * Serialize object with BigInt values to plain object with string values
 * Useful for Hono's c.json() which calls JSON.stringify internally
 */
export function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  )
}
