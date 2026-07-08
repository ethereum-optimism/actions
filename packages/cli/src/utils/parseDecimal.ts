import { parseUnits } from 'viem'

import { CliError } from '@/output/errors.js'

/**
 * @description Validates a CLI-supplied decimal string by delegating shape validation to viem's `parseUnits`. Rejects scientific notation, hex, whitespace, signed positives, empty strings, and bare punctuation (`.`, `-`). Negatives are accepted by viem but rejected here. Callers that need stricter bounds (positive-only, integer-part precision, etc.) layer additional checks on the returned number.
 * @param raw - Flag value as passed on argv.
 * @param flag - Flag label for error messages (e.g. `--amount`, `--slippage`).
 * @param hint - Hint string appended to the error message (e.g. `expected a decimal percent, e.g. 0.5`).
 * @returns The validated value as a non-negative number.
 * @throws `CliError` with code `validation` for malformed or negative input.
 */
export function parseDecimal(raw: string, flag: string, hint: string): number {
  // Empty string and bare punctuation slip through viem's regex (matches all-empty
  // groups) but parse to 0 / NaN downstream; reject up front to keep the error
  // message consistent.
  if (!/[0-9]/.test(raw)) throw rejectDecimal(raw, flag, hint)
  try {
    parseUnits(raw, 0)
  } catch {
    throw rejectDecimal(raw, flag, hint)
  }
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) {
    throw rejectDecimal(raw, flag, hint)
  }
  return value
}

function rejectDecimal(raw: string, flag: string, hint: string): CliError {
  return new CliError('validation', `Invalid ${flag}: ${raw} (${hint})`, {
    value: raw,
    flag,
  })
}
