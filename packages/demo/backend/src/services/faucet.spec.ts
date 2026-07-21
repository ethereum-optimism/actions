import * as viem from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  executeFaucetDrip,
  FAUCET_DRIP_COOLDOWN_MS,
  MAX_TRACKED_DRIP_RECIPIENTS,
  releaseDrip,
  reserveDrip,
} from './faucet.js'

const { getBalance, submitFaucetUserOperation } = vi.hoisted(() => ({
  getBalance: vi.fn<() => Promise<bigint>>(),
  submitFaucetUserOperation:
    vi.fn<
      (
        walletAddress: viem.Address,
      ) => Promise<{ success: boolean; userOpHash: viem.Hash }>
    >(),
}))

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof viem>()
  return { ...actual, createPublicClient: () => ({ getBalance }) }
})

vi.mock('./faucetSubmission.js', () => ({ submitFaucetUserOperation }))

// Use distinct addresses so module-level accounting cannot leak between cases.
const addr = (n: number): viem.Address =>
  viem.getAddress(`0x${n.toString(16).padStart(40, '0')}`)

const reservedWallets = new Set<viem.Address>()
const successfulSubmission = {
  success: true,
  userOpHash: viem.keccak256('0x'),
}

const claimDrip = (wallet: viem.Address, now: number): boolean => {
  const granted = reserveDrip(wallet, now)
  if (granted) reservedWallets.add(wallet)
  return granted
}

const executeTrackedDrip = (wallet: viem.Address) => {
  reservedWallets.add(wallet)
  return executeFaucetDrip(wallet)
}

beforeEach(() => {
  vi.resetAllMocks()
  getBalance.mockResolvedValue(0n)
  submitFaucetUserOperation.mockResolvedValue(successfulSubmission)
})

afterEach(() => {
  for (const wallet of reservedWallets) releaseDrip(wallet)
  reservedWallets.clear()
})

describe('faucet drip accounting', () => {
  describe('executeFaucetDrip', () => {
    it('submits an eligible reserved drip', async () => {
      const wallet = addr(7)

      await expect(executeTrackedDrip(wallet)).resolves.toEqual({
        status: 'success',
        userOpHash: successfulSubmission.userOpHash,
      })
      expect(submitFaucetUserOperation).toHaveBeenCalledWith(wallet)
    })

    it('rejects a wallet with an existing balance', async () => {
      const wallet = addr(8)
      getBalance.mockResolvedValue(1n)

      await expect(executeTrackedDrip(wallet)).resolves.toEqual({
        status: 'ineligible',
      })
      expect(submitFaucetUserOperation).not.toHaveBeenCalled()
    })

    it('returns failure when the eligibility lookup rejects', async () => {
      const wallet = addr(12)
      const error = new Error('rpc unavailable')
      getBalance.mockRejectedValue(error)

      await expect(executeTrackedDrip(wallet)).resolves.toEqual({
        status: 'failed',
        error,
      })
      expect(submitFaucetUserOperation).not.toHaveBeenCalled()
    })

    it('allows only one concurrent drip for a recipient', async () => {
      const wallet = addr(9)
      const outcomes = await Promise.all(
        Array.from({ length: 6 }, () => executeTrackedDrip(wallet)),
      )

      expect(
        outcomes.filter(({ status }) => status === 'success'),
      ).toHaveLength(1)
      expect(
        outcomes.filter(({ status }) => status === 'cooldown'),
      ).toHaveLength(5)
      expect(submitFaucetUserOperation).toHaveBeenCalledTimes(1)
    })

    it('releases the reservation after an unsuccessful submission', async () => {
      const wallet = addr(10)
      submitFaucetUserOperation.mockResolvedValue({
        ...successfulSubmission,
        success: false,
      })

      await expect(executeTrackedDrip(wallet)).resolves.toEqual({
        status: 'failed',
      })
      expect(claimDrip(wallet, Date.now())).toBe(true)
    })

    it('releases the reservation after a rejected submission', async () => {
      const wallet = addr(11)
      const error = new Error('bundler down')
      submitFaucetUserOperation.mockRejectedValue(error)

      await expect(executeTrackedDrip(wallet)).resolves.toEqual({
        status: 'failed',
        error,
      })
      expect(claimDrip(wallet, Date.now())).toBe(true)
    })
  })

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
      const lowercased = '0xabc0000000000000000000000000000000000004'
      const checksummed = viem.getAddress(lowercased)
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
