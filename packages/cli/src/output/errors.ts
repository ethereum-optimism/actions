import {
  ActionsError,
  EnsResolutionError,
  EnsRpcError,
  ProviderNotConfiguredError,
  serializeBigInt,
} from '@eth-optimism/actions-sdk'
import { BaseError, ContractFunctionRevertedError } from 'viem'

import { isJsonMode } from '@/output/mode.js'

/**
 * @description Error categories consumed by the caller. The code determines
 * the process exit value and the default retryability - callers may override
 * the latter through `CliError.retryableOverride`.
 */
export type ErrorCode =
  | 'unknown'
  | 'validation'
  | 'config'
  | 'network'
  | 'onchain'

const EXIT: Record<ErrorCode, number> = {
  unknown: 1,
  validation: 2,
  config: 3,
  network: 4,
  onchain: 5,
}

const RETRYABLE_DEFAULT: Record<ErrorCode, boolean> = {
  unknown: false,
  validation: false,
  config: false,
  network: true,
  onchain: false,
}

/**
 * @description Structured error raised from command handlers. Carries a
 * discriminator `code`, an optional `details` payload, and optional
 * retry hints the caller can use without parsing free-form messages.
 */
export class CliError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly retryableOverride?: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'CliError'
  }

  get retryable(): boolean {
    return this.retryableOverride ?? RETRYABLE_DEFAULT[this.code]
  }
}

/**
 * @description Process exit code associated with an `ErrorCode`.
 * @param code - Error category.
 * @returns Non-zero exit value consumed by the parent process.
 */
export function exitCodeFor(code: ErrorCode): number {
  return EXIT[code]
}

/**
 * @description Default retryability hint for an `ErrorCode`. Callers may
 * override per-instance via `CliError.retryableOverride`.
 * @param code - Error category.
 * @returns `true` when the caller may retry without user intervention.
 */
export function retryableDefaultFor(code: ErrorCode): boolean {
  return RETRYABLE_DEFAULT[code]
}

// RPC and bundler URLs frequently embed API keys in the path or query string,
// and the shape varies across providers (Alchemy, Infura, Tenderly, Pimlico,
// self-hosted). Treat any http(s) URL surfaced in error output as sensitive
// and replace it wholesale rather than trying to redact individual segments.
const URL_PATTERN = /https?:\/\/[^\s'"<>]+/g
const REDACTED_URL = '[redacted-url]'

// Own-property keys set by viem's `BaseError` constructor that we must NOT
// surface as part of an SDK error's `details` payload, they are framework
// metadata, not caller-relevant context.
const VIEM_BASE_ERROR_KEYS = new Set([
  'name',
  'details',
  'docsPath',
  'metaMessages',
  'shortMessage',
  'version',
])

function sdkErrorDetails(err: ActionsError): Record<string, unknown> {
  const out: Record<string, unknown> = { errorName: err.name }
  for (const [k, v] of Object.entries(err)) {
    if (VIEM_BASE_ERROR_KEYS.has(k)) continue
    out[k] = v
  }
  return out
}

/**
 * @description Maps any thrown value into a `CliError` with the right code:
 * - `CliError` instances pass through unchanged.
 * - `ProviderNotConfiguredError` → `config`.
 * - `EnsResolutionError` → `validation`.
 * - `EnsRpcError` → retryable `network`.
 * - Other `ActionsError` subclasses → `validation` (carries the SDK error's own properties as `details`).
 * - viem `ContractFunctionRevertedError` → `onchain`.
 * - Anything else → retryable `network`.
 *
 * The mapping is preferred over substring matching against `err.message`
 * because typed SDK errors carry structured metadata (chainId, symbol, etc.)
 * that the agent can act on without parsing free-form text.
 * @param err - Caught exception.
 * @returns The corresponding `CliError`.
 */
export function toCliError(err: unknown): CliError {
  if (err instanceof CliError) return err
  if (err instanceof ProviderNotConfiguredError) {
    return new CliError('config', err.shortMessage, sdkErrorDetails(err))
  }
  if (err instanceof EnsResolutionError) {
    return new CliError('validation', err.message, { input: err.input })
  }
  if (err instanceof EnsRpcError) {
    return new CliError('network', err.message, { input: err.input })
  }
  if (err instanceof ActionsError) {
    return new CliError('validation', err.shortMessage, sdkErrorDetails(err))
  }
  if (err instanceof ContractFunctionRevertedError) {
    return new CliError('onchain', err.shortMessage, { cause: err })
  }
  const message = err instanceof Error ? err.message : String(err)
  return new CliError('network', message, { cause: err })
}

/**
 * @description Re-throws a caught exception as the right `CliError`.
 * Convenience wrapper around `toCliError` for handlers' `catch` blocks.
 * @param err - Caught exception.
 * @returns Never; always throws.
 */
export function rethrowAsCliError(err: unknown): never {
  throw toCliError(err)
}

/**
 * @description Re-throws a caught exception as a `CliError` enriched with caller-supplied context (e.g. chainId, asset symbols) on top of whatever `toCliError` already extracted. The new `details` payload merges the existing one with `context`; existing keys win on conflict so SDK-error metadata isn't clobbered. Use this in handler `catch` blocks when the error code alone isn't actionable for the agent.
 * @param err - Caught exception.
 * @param context - Plain record of fields to merge into `details`.
 * @returns Never; always throws.
 */
export function rethrowWithContext(
  err: unknown,
  context: Record<string, unknown>,
): never {
  const cliErr = toCliError(err)
  const existing = (cliErr.details ?? {}) as Record<string, unknown>
  throw new CliError(
    cliErr.code,
    cliErr.message,
    { ...context, ...existing },
    cliErr.retryableOverride,
    cliErr.retryAfterMs,
  )
}

const SCALAR_ALLOWLIST = new Set([
  'chainId',
  'code',
  'errorName',
  'functionName',
  'market',
  'method',
  'operation',
  'reason',
  'shortMessage',
  'status',
  'symbol',
])

const SENSITIVE_KEYS = new Set([
  'account',
  'address',
  'from',
  'headers',
  'privateKey',
  'publicKey',
  'request',
  'signer',
  'signature',
])

function redactUrls(s: string): string {
  return s.replace(URL_PATTERN, REDACTED_URL)
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactUrls(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value
  if (Array.isArray(value)) return value.map(redactValue)
  if (value instanceof BaseError) return reduceViemError(value)
  if (typeof value === 'object')
    return redactRecord(value as Record<string, unknown>)
  return undefined
}

function reduceViemError(err: BaseError): {
  errorName: string
  shortMessage: string
} {
  return {
    errorName: err.name,
    shortMessage: redactUrls(err.shortMessage),
  }
}

function redactRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(record)) {
    if (SENSITIVE_KEYS.has(key)) continue
    if (raw && typeof raw === 'object') {
      if (raw instanceof BaseError) {
        out[key] = reduceViemError(raw)
        continue
      }
      const redacted = redactValue(raw)
      if (redacted !== undefined) out[key] = redacted
      continue
    }
    if (typeof raw === 'string') {
      out[key] = redactUrls(raw)
      continue
    }
    if (SCALAR_ALLOWLIST.has(key)) {
      out[key] = raw
      continue
    }
    if (
      typeof raw === 'number' ||
      typeof raw === 'boolean' ||
      typeof raw === 'bigint' ||
      raw === null
    ) {
      out[key] = raw
    }
  }
  return out
}

/**
 * @description Redacts a `CliError.details` payload before it is serialised
 * to stderr. Drops known-sensitive keys (signer metadata, request bodies),
 * reduces viem error instances to `{ errorName, shortMessage }`, and replaces
 * any http(s) URL it encounters with `[redacted-url]` to keep API keys out of
 * stack traces and `--json` payloads. The allowlist is intentionally
 * conservative - unknown scalars are preserved only when their key is in
 * `SCALAR_ALLOWLIST`.
 * @param details - Arbitrary data attached to a `CliError`.
 * @returns A safe-to-emit clone of `details`.
 */
export function safeDetails(details: unknown): unknown {
  if (details === undefined) return undefined
  return redactValue(details)
}

/**
 * @description Detects Node `EPIPE` errors thrown when stdout/stderr is closed by the receiving process (e.g. `actions ... | head -n 5`). Used at the process boundary to exit cleanly instead of treating a closed pipe as a runtime failure.
 * @param err - Any thrown value.
 * @returns `true` if `err` looks like an EPIPE error.
 */
export function isEpipeError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: unknown }).code === 'EPIPE'
  )
}

// C0/C1 include ANSI/OSC terminal controls; strip them from text errors.
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g

/**
 * @description Writes an error envelope to stderr and exits with the
 * taxonomy's mapped exit code. The body matches the contract
 * `{ error, code, retryable, retry_after_ms?, details? }`. `details` is
 * always redacted; `bigint` values in any field are coerced to strings.
 * EPIPE on the stderr write is swallowed (the parent has closed the pipe).
 * @param err - Any thrown value. `CliError` receives full fidelity; other
 * values are reported under `code: "unknown"`.
 */
export function writeError(err: unknown): never {
  const cliErr = err instanceof CliError ? err : undefined
  const code: ErrorCode = cliErr?.code ?? 'unknown'
  const rawMessage = err instanceof Error ? err.message : String(err)
  // SDK exception messages can include the RPC URL (and embedded API key); the
  // `details` payload is already redacted via `safeDetails`, so apply the same
  // strip to the top-level `error` field before we emit it.
  const message = redactUrls(rawMessage)
  const retryable = cliErr?.retryable ?? RETRYABLE_DEFAULT[code]
  const body = isJsonMode()
    ? JSON.stringify(
        serializeBigInt({
          error: message,
          code,
          retryable,
          retry_after_ms: cliErr?.retryAfterMs,
          details: cliErr ? safeDetails(cliErr.details) : undefined,
        }),
        null,
        2,
      ) + '\n'
    : `Error (${code}): ${message.replace(CONTROL_CHARS, '')}\n`
  try {
    process.stderr.write(body)
  } catch (writeErr) {
    if (!isEpipeError(writeErr)) throw writeErr
  }
  process.exit(EXIT[code])
}
