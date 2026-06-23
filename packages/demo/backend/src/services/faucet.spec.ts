import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import { FAUCET_DRIP_COOLDOWN_MS, releaseDrip, reserveDrip } from './faucet.js'

// Distinct address per test so the module-level accounting map never leaks
// state between cases.
const addr = (n: number): Address =>
  `0x${n.toString(16).padStart(40, '0')}` as Address

describe('faucet drip accounting', () => {
  describe('reserveDrip', () => {
    it('grants the first drip and denies a repeat within the cooldown', () => {
      const wallet = addr(1)
      const t0 = 1_000_000
      expect(reserveDrip(wallet, t0)).toBe(true)
      expect(reserveDrip(wallet, t0 + 1)).toBe(false)
      expect(reserveDrip(wallet, t0 + FAUCET_DRIP_COOLDOWN_MS - 1)).toBe(false)
    })

    it('is atomic: only one of N same-instant claims for one wallet wins', () => {
      const wallet = addr(2)
      const now = 5_000_000
      // reserveDrip is synchronous, so N "concurrent" claims reduce to N
      // back-to-back calls at the same instant — exactly one must succeed.
      const grants = Array.from({ length: 25 }, () => reserveDrip(wallet, now))
      expect(grants.filter(Boolean)).toHaveLength(1)
    })

    it('re-qualifies once the cooldown has fully elapsed', () => {
      const wallet = addr(3)
      const t0 = 9_000_000
      expect(reserveDrip(wallet, t0)).toBe(true)
      expect(reserveDrip(wallet, t0 + FAUCET_DRIP_COOLDOWN_MS)).toBe(true)
    })

    it('keys recipients case-insensitively', () => {
      const checksummed =
        '0xAbC0000000000000000000000000000000000004' as Address
      const lowercased = '0xabc0000000000000000000000000000000000004' as Address
      const t0 = 2_000_000
      expect(reserveDrip(checksummed, t0)).toBe(true)
      expect(reserveDrip(lowercased, t0 + 1)).toBe(false)
    })

    it('still denies a wallet swept back to zero (balance is not the gate)', () => {
      // A swept wallet would re-pass the on-chain `balance == 0` pre-check;
      // the recorded reservation, not balance, keeps it denied in cooldown.
      const wallet = addr(5)
      const t0 = 3_000_000
      expect(reserveDrip(wallet, t0)).toBe(true)
      expect(reserveDrip(wallet, t0 + 60_000)).toBe(false)
    })
  })

  describe('releaseDrip', () => {
    it('rolls back a reservation so a failed drip can be retried', () => {
      const wallet = addr(6)
      const t0 = 4_000_000
      expect(reserveDrip(wallet, t0)).toBe(true)
      releaseDrip(wallet)
      expect(reserveDrip(wallet, t0 + 1)).toBe(true)
    })
  })
})
