import type {
  Asset,
  SupportedChainId,
  SwapProviderName,
  SwapQuoteParams,
} from '@eth-optimism/actions-sdk'

import { parseAmount } from '@/commands/wallet/lend/util.js'
import { CliError } from '@/output/errors.js'
import { resolveAsset } from '@/resolvers/assets.js'
import { resolveChain } from '@/resolvers/chains.js'

const PROVIDERS: readonly SwapProviderName[] = ['uniswap', 'velodrome']

/**
 * @description Validates that exactly one of `--amount-in` / `--amount-out`
 * is present and parses it to a positive number. Throws
 * `CliError('validation')` when both are provided or neither is.
 * @param amountIn - Raw `--amount-in` flag value.
 * @param amountOut - Raw `--amount-out` flag value.
 * @returns One-sided amount envelope with the other field undefined.
 */
export function parseAmountFlags(
  amountIn: string | undefined,
  amountOut: string | undefined,
): { amountIn?: number; amountOut?: number } {
  if (!amountIn && !amountOut) {
    throw new CliError(
      'validation',
      'One of --amount-in or --amount-out is required',
    )
  }
  if (amountIn && amountOut) {
    throw new CliError(
      'validation',
      'Pass either --amount-in or --amount-out, not both',
    )
  }
  return amountIn
    ? { amountIn: parseAmount(amountIn) }
    : { amountOut: parseAmount(amountOut!) }
}

/**
 * @description Parses a `--slippage <pct>` value. Accepts a percent
 * literal (e.g. `0.5` = 0.5%) and converts to the decimal form the SDK
 * expects (e.g. `0.005`). `100` is the upper bound.
 * @param raw - Flag value as passed on argv, or undefined.
 * @returns Decimal slippage in `[0, 1]` when provided, else undefined.
 * @throws `CliError` with code `validation` when not a number in `[0, 100]`.
 */
export function parseSlippage(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new CliError(
      'validation',
      `Invalid --slippage: ${raw} (expected a percent in [0, 100])`,
      { slippage: raw },
    )
  }
  return value / 100
}

/**
 * @description Parses a `--provider` value against the configured
 * provider names. Returns `undefined` when not supplied, letting the SDK
 * apply its routing config instead.
 * @param raw - Flag value as passed on argv, or undefined.
 * @returns `SwapProviderName` when recognised, otherwise undefined.
 * @throws `CliError` with code `validation` for any other value.
 */
export function parseProvider(
  raw: string | undefined,
): SwapProviderName | undefined {
  if (raw === undefined) return undefined
  const needle = raw.toLowerCase() as SwapProviderName
  if (!PROVIDERS.includes(needle)) {
    throw new CliError(
      'validation',
      `Invalid --provider: ${raw} (expected one of ${PROVIDERS.join(', ')})`,
      { provider: raw, allowed: PROVIDERS.slice() },
    )
  }
  return needle
}

export interface QuoteFlags {
  in: string
  out: string
  amountIn?: string
  amountOut?: string
  chain: string
  provider?: string
  slippage?: string
}

/**
 * @description Builds a `SwapQuoteParams` object from the CLI flag set
 * shared by `quote`, `quotes`, and `execute`. Validates the assets and
 * chain are in the active config, enforces the amount-in/out XOR, and
 * converts the percent slippage to decimal.
 * @param flags - Commander-parsed flags.
 * @param allow - Asset allowlist from config.
 * @param chainIds - Configured chain IDs.
 * @returns Resolved quote parameters ready for the SDK.
 */
export function buildQuoteParams(
  flags: QuoteFlags,
  allow: readonly Asset[],
  chainIds: readonly SupportedChainId[],
): SwapQuoteParams {
  const assetIn = resolveAsset(flags.in, allow)
  const assetOut = resolveAsset(flags.out, allow)
  const chainId = resolveChain(flags.chain, chainIds)
  const amounts = parseAmountFlags(flags.amountIn, flags.amountOut)
  const provider = parseProvider(flags.provider)
  const slippage = parseSlippage(flags.slippage)
  return {
    assetIn,
    assetOut,
    chainId,
    ...amounts,
    ...(provider ? { provider } : {}),
    ...(slippage !== undefined ? { slippage } : {}),
  }
}
