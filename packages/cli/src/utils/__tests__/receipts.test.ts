import { describe, expect, it } from 'vitest'

import { CliError } from '@/output/errors.js'
import { ensureOnchainSuccess } from '@/utils/receipts.js'

const ok = (transactionHash: string) => ({
  transactionHash,
  status: 'success' as const,
  blockNumber: 1n,
  gasUsed: 21000n,
})

const reverted = (transactionHash: string) => ({
  transactionHash,
  status: 'reverted' as const,
  blockNumber: 2n,
  gasUsed: 21000n,
})

const userOpFailure = (userOpHash: string) => ({
  success: false as const,
  userOpHash,
})

describe('ensureOnchainSuccess', () => {
  it('returns without throwing when every leg succeeded', () => {
    expect(() =>
      ensureOnchainSuccess([ok('0xa'), ok('0xb')] as never),
    ).not.toThrow()
  })

  it('throws CliError(onchain) carrying the full receipts array on a batched failure', () => {
    // Sequential EOA bundle: approve + supplyCollateral mined, borrow reverts.
    const receipts = [ok('0xapprove'), ok('0xsupply'), reverted('0xborrow')]
    try {
      ensureOnchainSuccess(receipts as never)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      const cliErr = err as CliError
      expect(cliErr.code).toBe('onchain')
      expect(cliErr.message).toBe('Transaction status: reverted')
      const details = cliErr.details as Record<string, unknown>
      // The failing leg's own diagnostics are preserved...
      expect(details.transactionHash).toBe('0xborrow')
      // ...and the already-mined legs are retained, not dropped.
      expect(details.transactions).toEqual(receipts)
      expect(
        (details.transactions as Array<{ transactionHash: string }>).map(
          (r) => r.transactionHash,
        ),
      ).toEqual(['0xapprove', '0xsupply', '0xborrow'])
    }
  })

  it('includes the receipts array for a failed UserOperation', () => {
    const receipts = [userOpFailure('0xuserop')]
    try {
      ensureOnchainSuccess(receipts as never)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      const cliErr = err as CliError
      expect(cliErr.code).toBe('onchain')
      expect(cliErr.message).toBe('UserOperation failed')
      const details = cliErr.details as Record<string, unknown>
      expect(details.userOpHash).toBe('0xuserop')
      expect(details.transactions).toEqual(receipts)
    }
  })
})
