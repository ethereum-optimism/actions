import type { Address } from 'viem'
import { afterEach, describe, expect, it } from 'vitest'

import {
  FAUCET_DRIP_COOLDOWN_MS,
  MAX_TRACKED_DRIP_RECIPIENTS,
  releaseDrip,
  reserveDrip,
} from './faucet.js'

// Use distinct addresses so module-level accounting cannot leak between cases.
const addr = (n: number): Address =>
  `0x${n.toString(16).padStart(40, '0')}` as Address

const reservedWallets = new Set<Address>()
const claimDrip = (wallet: Address, now: number): boolean => {
  const granted = reserveDrip(wallet, now)
  if (granted) reservedWallets.add(wallet)
  return granted
}

afterEach(() => {
  for (const wallet of reservedWallets) releaseDrip(wallet)
  reservedWallets.clear()
})

describe('faucet drip accounting', () => {
  describe('reserveDrip', () => {
    it('grants the first drip and denies a repeat within the cooldown', () => {
      const wallet = addr(1)
      const t0 = 1_000_000
      expect(claimDrip(wallet, t0)).toBe(true)
      expect(claimDrip(wallet, t0 + 1)).toBe(false)
      expect(claimDrip(wallet, t0 + FAUCET_DRIP_COOLDOWN_MS - 1)).toBe(false)
    })

    it('is atomic: only one of N same-instant claims for one wallet wins', () => {
      const wallet = addr(2)
      const now = 5_000_000
      // Same-instant synchronous claims reduce to back-to-back reserve attempts.
      const grants = Array.from({ length: 25 }, () => claimDrip(wallet, now))
      expect(grants.filter(Boolean)).toHaveLength(1)
    })

    it('re-qualifies once the cooldown has fully elapsed', () => {
      const wallet = addr(3)
      const t0 = 9_000_000
      expect(claimDrip(wallet, t0)).toBe(true)
      expect(claimDrip(wallet, t0 + FAUCET_DRIP_COOLDOWN_MS)).toBe(true)
    })

    it('keys recipients case-insensitively', () => {
      const checksummed =
        '0xAbC0000000000000000000000000000000000004' as Address
      const lowercased = '0xabc0000000000000000000000000000000000004' as Address
      const t0 = 2_000_000
      expect(claimDrip(checksummed, t0)).toBe(true)
      expect(claimDrip(lowercased, t0 + 1)).toBe(false)
    })

    it('still denies a wallet swept back to zero (balance is not the gate)', () => {
      // The recorded reservation, not balance, keeps swept wallets in cooldown.
      const wallet = addr(5)
      const t0 = 3_000_000
      expect(claimDrip(wallet, t0)).toBe(true)
      expect(claimDrip(wallet, t0 + 60_000)).toBe(false)
    })

    it('rejects new recipients when active accounting is at the cap', () => {
      const now = FAUCET_DRIP_COOLDOWN_MS + 20_000_000
      const wallets = Array.from(
        { length: MAX_TRACKED_DRIP_RECIPIENTS },
        (_value, index) => addr(100_000 + index),
      )

      for (const wallet of wallets) {
        expect(claimDrip(wallet, now)).toBe(true)
      }
      expect(claimDrip(addr(200_000), now)).toBe(false)
    })
  })

  describe('releaseDrip', () => {
    it('rolls back a reservation so a failed drip can be retried', () => {
      const wallet = addr(6)
      const t0 = 4_000_000
      expect(claimDrip(wallet, t0)).toBe(true)
      releaseDrip(wallet)
      reservedWallets.delete(wallet)
      expect(claimDrip(wallet, t0 + 1)).toBe(true)
    })
  })
})
