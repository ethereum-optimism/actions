import { CliError } from '@/output/errors.js'
import { parseDecimal } from '@/utils/parseDecimal.js'

const HINT = 'expected a positive decimal, e.g. 10 or 0.5'

function rejectAmount(raw: string, flag: string): never {
  throw new CliError('validation', `Invalid ${flag}: ${raw} (${HINT})`, {
    amount: raw,
    flag,
  })
}

/**
 * @description Parses a CLI-provided amount string. Accepts plain positive decimals (`10`, `0.5`, `1.25`). Shape validation is delegated to `parseDecimal` (viem-backed: rejects scientific notation, hex, signs, whitespace). Adds amount-specific guards on top: integer parts above `Number.MAX_SAFE_INTEGER` (which lose precision through the float round-trip into the SDK's `parseUnits(asset.decimals)`) and zero (amounts must be strictly positive). The `flag` label is surfaced in the error so callers can disambiguate `--amount` from `--amount-in` / `--amount-out` etc.
 * @param raw - Flag value as passed on argv.
 * @param flag - Flag label for error messages (e.g. `--amount`, `--amount-in`). Defaults to `--amount`.
 * @returns The validated amount as a number.
 * @throws `CliError` with code `validation` when the value is not a positive plain decimal.
 */
export function parseAmount(raw: string, flag = '--amount'): number {
  const value = parseDecimal(raw, flag, HINT)
  if (value <= 0) rejectAmount(raw, flag)
  const intPart = raw.split('.')[0] ?? ''
  if (intPart && BigInt(intPart) > BigInt(Number.MAX_SAFE_INTEGER)) {
    rejectAmount(raw, flag)
  }
  return value
}
