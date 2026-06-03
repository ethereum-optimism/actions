import { APPROVAL_MODES, type ApprovalMode } from '@eth-optimism/actions-sdk'

import { CliError } from '@/output/errors.js'

/**
 * @description Validates a raw `--approval-mode` argv value against the SDK's `APPROVAL_MODES` allowlist (`exact` | `max`). Returns `undefined` when the flag is omitted so the wallet's resolved default applies. Shared by every write verb that exposes `--approval-mode` (borrow `open` / `deposit-collateral` / `repay`, lend `open`, and swap `execute`); they all carry identical semantics, so the check lives here rather than being copied per command.
 * @param raw - The argv value as a string, or `undefined` when the flag is unset.
 * @returns The validated `ApprovalMode`, or `undefined` when `raw` is `undefined`.
 * @throws `CliError` with code `validation` when `raw` is set but is not a recognised approval mode.
 */
export function parseApprovalMode(
  raw: string | undefined,
): ApprovalMode | undefined {
  if (raw === undefined) return undefined
  if ((APPROVAL_MODES as readonly string[]).includes(raw)) {
    return raw as ApprovalMode
  }
  throw new CliError(
    'validation',
    `Invalid --approval-mode: ${raw} (expected ${APPROVAL_MODES.join(' or ')})`,
    { approvalMode: raw },
  )
}
