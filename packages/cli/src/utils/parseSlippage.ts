import { parseDecimal } from '@/utils/parseDecimal.js'

/**
 * @description Parses a `--slippage <pct>` value. Accepts a decimal percent literal (e.g. `0.5` = 0.5%) and converts to the decimal form the SDK expects (e.g. `0.005`). Shape validation is delegated to `parseDecimal` (viem-backed: rejects scientific notation, hex, signs, whitespace). The upper bound is enforced by the SDK via `SwapSettings.maxSlippage` (default 50%) and surfaced as `SlippageOutOfRangeError` → CLI `validation`.
 * @param raw - Flag value as passed on argv, or undefined.
 * @returns Decimal slippage when provided, else undefined.
 * @throws `CliError` with code `validation` for malformed or negative input.
 */
export function parseSlippage(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  return (
    parseDecimal(raw, '--slippage', 'expected a decimal percent, e.g. 0.5') /
    100
  )
}
