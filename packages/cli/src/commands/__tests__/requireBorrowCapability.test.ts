import { describe, expect, it } from 'vitest'

import { requireBorrowCapability } from '@/commands/wallet/borrow/requireBorrowCapability.js'
import { CliError } from '@/output/errors.js'

describe('requireBorrowCapability', () => {
  it('throws CliError(config) when wallet.has("borrow") is false', () => {
    const wallet = {
      has: (_n: string) => false,
    } as never
    try {
      requireBorrowCapability(wallet)
      throw new Error('did not throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).code).toBe('config')
      expect((err as CliError).message).toMatch(/Borrowing is not configured/)
    }
  })

  it('passes through when wallet.has("borrow") is true', () => {
    const wallet = {
      has: (n: string) => n === 'borrow',
      borrow: {},
    } as never
    expect(() => requireBorrowCapability(wallet)).not.toThrow()
  })
})
