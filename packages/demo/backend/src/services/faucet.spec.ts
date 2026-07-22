import type { Address } from 'viem'
import * as viem from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { faucetAbi } from '@/abis/ethFaucet.js'

import {
  executeFaucetDrip,
  FAUCET_DRIP_COOLDOWN_MS,
  MAX_TRACKED_DRIP_RECIPIENTS,
  releaseDrip,
  reserveDrip,
} from './faucet.js'

const { getBalance, getSmartWallet, sendBatch } = vi.hoisted(() => {
  const sendBatch = vi.fn<
    (
      transactions: ReadonlyArray<{
        to: viem.Address
        data: viem.Hex
        value: bigint
      }>,
      chainId: number,
    ) => Promise<{ success: boolean; userOpHash: viem.Hash }>
  >()
  return {
    getBalance: vi.fn<() => Promise<bigint>>(),
    getSmartWallet: vi.fn<() => Promise<{ sendBatch: typeof sendBatch }>>(),
    sendBatch,
  }
})

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof viem>()
  return {
    ...actual,
    createPublicClient: () => ({ getBalance }),
  }
})

vi.mock('@/config/actions.js', () => ({
  getActions: () => ({ wallet: { getSmartWallet } }),
}))

vi.mock('@/config/env.js', () => ({
  env: {
    AUTH_MODULE_ADDRESS: '0x1111111111111111111111111111111111111111',
    FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    OP_SEPOLIA_FAUCET_ADDRESS: '0x2222222222222222222222222222222222222222',
    OP_SEPOLIA_RPC_URL: undefined,
  },
}))

// Use distinct addresses so module-level accounting cannot leak between cases.
const addr = (n: number): Address =>
  viem.getAddress(`0x${n.toString(16).padStart(40, '0')}`)

const reservedWallets = new Set<Address>()
const successfulDrip = {
  success: true,
  userOpHash: viem.keccak256('0x'),
}
const claimDrip = (wallet: Address, now: number): boolean => {
  const granted = reserveDrip(wallet, now)
  if (granted) reservedWallets.add(wallet)
  return granted
}

beforeEach(() => {
  vi.resetAllMocks()
  getBalance.mockResolvedValue(0n)
  getSmartWallet.mockResolvedValue({ sendBatch })
  sendBatch.mockResolvedValue(successfulDrip)
})

afterEach(() => {
  for (const wallet of reservedWallets) releaseDrip(wallet)
  reservedWallets.clear()
})

describe('faucet drip accounting', () => {
  describe('executeFaucetDrip', () => {
    it('submits an eligible recipient through the fixed faucet call', async () => {
      const wallet = addr(7)
      reservedWallets.add(wallet)

      await expect(executeFaucetDrip(wallet)).resolves.toEqual({
        status: 'success',
        userOpHash: successfulDrip.userOpHash,
      })
      const [transactions, chainId] = sendBatch.mock.calls[0]
      expect(transactions[0].to).toBe(
        '0x2222222222222222222222222222222222222222',
      )
      expect(chainId).toBe(11155420)
      const decoded = viem.decodeFunctionData({
        abi: faucetAbi,
        data: transactions[0].data,
      })
      expect(decoded.functionName).toBe('drip')
      expect(decoded.args?.[0]).toMatchObject({
        recipient: wallet,
        data: '0x',
      })
    })

    it('rejects a recipient with an existing balance', async () => {
      const wallet = addr(8)
      getBalance.mockResolvedValue(1n)

      await expect(executeFaucetDrip(wallet)).resolves.toEqual({
        status: 'ineligible',
      })
      expect(sendBatch).not.toHaveBeenCalled()
    })

    it('allows only one concurrent drip per recipient', async () => {
      const wallet = addr(9)
      reservedWallets.add(wallet)

      const outcomes = await Promise.all(
        Array.from({ length: 6 }, () => executeFaucetDrip(wallet)),
      )

      expect(
        outcomes.filter(({ status }) => status === 'success'),
      ).toHaveLength(1)
      expect(
        outcomes.filter(({ status }) => status === 'cooldown'),
      ).toHaveLength(5)
      expect(sendBatch).toHaveBeenCalledTimes(1)
    })

    it('releases the reservation after an unsuccessful submission', async () => {
      const wallet = addr(10)
      reservedWallets.add(wallet)
      sendBatch.mockResolvedValueOnce({
        ...successfulDrip,
        success: false,
      })

      await expect(executeFaucetDrip(wallet)).resolves.toEqual({
        status: 'failed',
      })
      await expect(executeFaucetDrip(wallet)).resolves.toMatchObject({
        status: 'success',
      })
    })

    it('releases the reservation when submission rejects', async () => {
      const wallet = addr(11)
      reservedWallets.add(wallet)
      const error = new Error('bundler down')
      sendBatch.mockRejectedValueOnce(error)

      await expect(executeFaucetDrip(wallet)).resolves.toEqual({
        status: 'failed',
        error,
      })
      await expect(executeFaucetDrip(wallet)).resolves.toMatchObject({
        status: 'success',
      })
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

    it('re-qualifies once the cooldown has fully elapsed', () => {
      const wallet = addr(3)
      const t0 = 9_000_000
      expect(claimDrip(wallet, t0)).toBe(true)
      expect(claimDrip(wallet, t0 + FAUCET_DRIP_COOLDOWN_MS)).toBe(true)
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
})
