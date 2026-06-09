/**
 * @description Splits a comma-separated string into trimmed, non-empty parts. Tolerates whitespace around commas and silently drops empty entries (e.g. trailing commas, double commas), so callers should treat an empty result as "caller supplied no usable values."
 * @param raw - The raw flag value as passed on argv.
 * @returns Array of trimmed parts, in input order; never contains empty strings.
 */
export function splitCsv(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}
