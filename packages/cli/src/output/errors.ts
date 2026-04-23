import { serializeBigInt } from '@eth-optimism/actions-sdk'

/**
 * @description Agent-consumable error categories. The code determines the
 * process exit value and the default retryability - callers may override
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
 * retry hints the agent can use without parsing free-form messages.
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
 * @returns `true` when the agent may retry without user intervention.
 */
export function retryableDefaultFor(code: ErrorCode): boolean {
  return RETRYABLE_DEFAULT[code]
}

const RPC_KEY_PATH = /\/v\d+\/[^/]+\/rpc(\?[^\s#]*)?/g

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

function stripRpcKey(url: string): string {
  return url.replace(RPC_KEY_PATH, '/v*/***/rpc')
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return stripRpcKey(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value
  if (Array.isArray(value)) return value.map(redactValue)
  if (isViemError(value)) return reduceViemError(value)
  if (typeof value === 'object')
    return redactRecord(value as Record<string, unknown>)
  return undefined
}

function isViemError(
  value: unknown,
): value is { name: string; shortMessage: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { shortMessage?: unknown }).shortMessage === 'string' &&
    typeof (value as { name?: unknown }).name === 'string'
  )
}

function reduceViemError(err: { name: string; shortMessage: string }): {
  errorName: string
  shortMessage: string
} {
  return {
    errorName: err.name,
    shortMessage: stripRpcKey(err.shortMessage),
  }
}

function redactRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(record)) {
    if (SENSITIVE_KEYS.has(key)) continue
    if (raw && typeof raw === 'object') {
      if (isViemError(raw)) {
        out[key] = reduceViemError(raw)
        continue
      }
      const redacted = redactValue(raw)
      if (redacted !== undefined) out[key] = redacted
      continue
    }
    if (typeof raw === 'string') {
      out[key] = stripRpcKey(raw)
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
 * reduces viem error instances to `{ errorName, shortMessage }`, and strips
 * API-key segments from any RPC/bundler URLs it encounters. The allowlist is
 * intentionally conservative - unknown scalars are preserved only when their
 * key is in `SCALAR_ALLOWLIST`.
 * @param details - Arbitrary data attached to a `CliError`.
 * @returns A safe-to-emit clone of `details`.
 */
export function safeDetails(details: unknown): unknown {
  if (details === undefined) return undefined
  return redactValue(details)
}

function isEpipe(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: unknown }).code === 'EPIPE'
  )
}

/**
 * @description Writes an error envelope to stderr and exits with the
 * taxonomy's mapped exit code. The body matches the agent contract
 * `{ error, code, retryable, retry_after_ms?, details? }`. `details` is
 * always redacted; `bigint` values in any field are coerced to strings.
 * EPIPE on the stderr write is swallowed (the parent has closed the pipe).
 * @param err - Any thrown value. `CliError` receives full fidelity; other
 * values are reported under `code: "unknown"`.
 */
export function writeError(err: unknown): never {
  const cliErr = err instanceof CliError ? err : undefined
  const code: ErrorCode = cliErr?.code ?? 'unknown'
  const message = err instanceof Error ? err.message : String(err)
  const body = serializeBigInt({
    error: message,
    code,
    retryable: cliErr?.retryable ?? RETRYABLE_DEFAULT[code],
    retry_after_ms: cliErr?.retryAfterMs,
    details: cliErr ? safeDetails(cliErr.details) : undefined,
  })
  try {
    process.stderr.write(JSON.stringify(body, null, 2) + '\n')
  } catch (writeErr) {
    if (!isEpipe(writeErr)) throw writeErr
  }
  process.exit(EXIT[code])
}
