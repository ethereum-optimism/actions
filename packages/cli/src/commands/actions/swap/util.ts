import {
  type Asset,
  type SupportedChainId,
  SWAP_PROVIDER_NAMES,
  type SwapProviderName,
  type WalletSwapParams,
} from '@eth-optimism/actions-sdk'

import { CliError } from '@/output/errors.js'
import { resolveAsset } from '@/resolvers/assets.js'
import { resolveChain } from '@/resolvers/chains.js'
import { parseAmount } from '@/utils/parseAmount.js'
import { parseSlippage } from '@/utils/parseSlippage.js'

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
    ? { amountIn: parseAmount(amountIn, '--amount-in') }
    : { amountOut: parseAmount(amountOut!, '--amount-out') }
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
  const needle = raw.toLowerCase()
  if (!isSwapProviderName(needle)) {
    throw new CliError(
      'validation',
      `Invalid --provider: ${raw} (expected one of ${SWAP_PROVIDER_NAMES.join(', ')})`,
      { provider: raw, allowed: SWAP_PROVIDER_NAMES.slice() },
    )
  }
  return needle
}

function isSwapProviderName(value: string): value is SwapProviderName {
  return (SWAP_PROVIDER_NAMES as readonly string[]).includes(value)
}

interface QuoteFlagsBase {
  in: string
  out: string
  chain: string
  provider?: string
  slippage?: string
}

/**
 * @description At-least-one-of `amountIn` / `amountOut`. The `?: never` branches make TS reject `{ ... }` (neither set) and `{ amountIn, amountOut }` (both set) at the call site; the runtime mutex check in `parseAmountFlags` still runs because commander's argv parsing is loosely typed.
 */
export type QuoteFlags =
  | (QuoteFlagsBase & { amountIn: string; amountOut?: never })
  | (QuoteFlagsBase & { amountIn?: never; amountOut: string })

/**
 * @description Wallet-scoped swap-execute flags. Extends `QuoteFlags` with the write-only knobs that don't make sense on the read-only `swap quote/quotes` paths.
 */
export type WalletExecuteFlags = QuoteFlags & {
  approvalMode?: string
  recipient?: string
  deadline?: string
}

// Mirrors the SDK's `ApprovalMode = 'exact' | 'max'` (declared in
// `@/types/actions` but not re-exported from the SDK barrel).
const APPROVAL_MODES = ['exact', 'max'] as const
type ApprovalMode = (typeof APPROVAL_MODES)[number]

export function parseApprovalMode(
  raw: string | undefined,
): ApprovalMode | undefined {
  if (raw === undefined) return undefined
  if ((APPROVAL_MODES as readonly string[]).includes(raw)) {
    return raw as ApprovalMode
  }
  throw new CliError(
    'validation',
    `Invalid --approval-mode: ${raw} (expected exact or max)`,
    { approvalMode: raw },
  )
}

/**
 * @description Adds wallet-only knobs (`approvalMode`) on top of the shared quote params produced by `buildQuoteParams`.
 */
function parseDeadline(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new CliError(
      'validation',
      `Invalid --deadline: ${raw} (expected a positive Unix timestamp in seconds)`,
      { deadline: raw },
    )
  }
  return Number(raw)
}

export function buildWalletExecuteParams(
  flags: WalletExecuteFlags,
  allow: readonly Asset[],
  chainIds: readonly SupportedChainId[],
): WalletSwapParams {
  const base = buildSwapInputs(flags, allow, chainIds)
  const approvalMode = parseApprovalMode(flags.approvalMode)
  // Recipient validation (address-vs-ENS) is the SDK's responsibility:
  // `BaseSwapNamespace.resolveRecipient` resolves ENS → address before any
  // provider sees the value. The CLI passes the raw string through.
  const recipient = flags.recipient as WalletSwapParams['recipient'] | undefined
  const deadline = parseDeadline(flags.deadline)
  return {
    ...base,
    ...(approvalMode ? { approvalMode } : {}),
    ...(recipient ? { recipient } : {}),
    ...(deadline !== undefined ? { deadline } : {}),
  }
}

/**
 * @description Builds the shared swap input shape from CLI flags.
 * `WalletSwapParams` is the structural superset of `SwapQuoteParams`
 * (one extra optional `approvalMode`), so the same value flows into
 * `actions.swap.getQuote(s)` and `wallet.swap.execute` without
 * coercion. Validates assets and chain against config, enforces the
 * amount-in/out XOR, and converts percent slippage to decimal.
 * @param flags - Commander-parsed flags.
 * @param allow - Asset allowlist from config.
 * @param chainIds - Configured chain IDs.
 * @returns Resolved swap input ready for any of the SDK swap calls.
 */
export function buildSwapInputs(
  flags: QuoteFlags,
  allow: readonly Asset[],
  chainIds: readonly SupportedChainId[],
): WalletSwapParams {
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
