import { CliError } from '@/output/errors.js'

// Plain positive decimal: digits, optional `.` followed by more digits. No
// scientific notation, no hex, no leading `+`/`-`/`.`/whitespace. The SDK
// converts to wei using the asset's decimals; permitting `1e-19` here would
// silently round to 0 wei after `parseUnits`.
const DECIMAL_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/

function rejectAmount(raw: string): never {
  throw new CliError(
    'validation',
    `Invalid --amount: ${raw} (expected a positive decimal, e.g. 10 or 0.5)`,
    { amount: raw },
  )
}

/**
 * @description Parses a CLI-provided amount string. Accepts plain positive decimals (`10`, `0.5`, `1.25`). Rejects scientific notation, hex, leading signs, whitespace, bigint-style suffixes, and integer parts above `Number.MAX_SAFE_INTEGER` (which lose precision through the float round-trip into the SDK).
 * @param raw - Flag value as passed on argv.
 * @returns The validated amount as a number.
 * @throws `CliError` with code `validation` when the value is not a positive plain decimal.
 */
export function parseAmount(raw: string): number {
  if (!DECIMAL_AMOUNT.test(raw)) rejectAmount(raw)
  const intPart = raw.split('.')[0] ?? ''
  if (BigInt(intPart) > BigInt(Number.MAX_SAFE_INTEGER)) rejectAmount(raw)
  const value = Number(raw)
  if (value <= 0) rejectAmount(raw)
  return value
}
