import type { Address } from 'viem'
import { expect } from 'vitest'

import type { ForkClient } from './forks.js'
import { getERC20Balance } from './funding.js'

/**
 * Assert that an ERC20 balance changed by at least `minDelta` after executing `fn`.
 * Positive delta = balance increased. Negative delta = balance decreased.
 */
export async function expectBalanceChange(
  client: ForkClient,
  token: Address,
  account: Address,
  fn: () => Promise<void>,
  minDelta: bigint,
): Promise<void> {
  const before = await getERC20Balance(client, token, account)
  await fn()
  const after = await getERC20Balance(client, token, account)
  const delta = after - before

  if (minDelta > 0n) {
    expect(delta).toBeGreaterThanOrEqual(minDelta)
  } else if (minDelta < 0n) {
    expect(delta).toBeLessThanOrEqual(minDelta)
  }
}

/**
 * Assert that native ETH balance changed after executing `fn`.
 */
export async function expectETHBalanceChange(
  client: ForkClient,
  account: Address,
  fn: () => Promise<void>,
  minDelta: bigint,
): Promise<void> {
  const before = await client.getBalance({ address: account })
  await fn()
  const after = await client.getBalance({ address: account })
  const delta = after - before

  if (minDelta > 0n) {
    expect(delta).toBeGreaterThanOrEqual(minDelta)
  } else if (minDelta < 0n) {
    expect(delta).toBeLessThanOrEqual(minDelta)
  }
}

/**
 * Assert that a transaction receipt (or array of receipts) succeeded.
 * Handles EOA receipts (.status), UserOperation receipts (.success),
 * and wrapped receipts (.receipt.status). Throws on unrecognised shapes
 * so tests cannot silently pass with the wrong receipt type.
 */
export function expectReceiptSuccess(receipt: unknown): void {
  if (receipt == null || typeof receipt !== 'object') {
    throw new Error(
      `expectReceiptSuccess: received ${receipt === null ? 'null' : typeof receipt}, expected a receipt object`,
    )
  }

  if (Array.isArray(receipt)) {
    expect(receipt.length).toBeGreaterThan(0)
    for (const r of receipt) expectReceiptSuccess(r)
    return
  }

  const r = receipt as Record<string, unknown>

  if ('status' in r) {
    expect(r.status).toBe('success')
  } else if ('success' in r) {
    expect(r.success).toBe(true)
  } else if (
    'receipt' in r &&
    typeof r.receipt === 'object' &&
    r.receipt !== null
  ) {
    expect((r.receipt as Record<string, unknown>).status).toBe('success')
  } else {
    throw new Error(
      `expectReceiptSuccess: unrecognised receipt shape (keys: ${Object.keys(r).join(', ')}). ` +
        'Expected an object with "status", "success", or "receipt.status".',
    )
  }
}
