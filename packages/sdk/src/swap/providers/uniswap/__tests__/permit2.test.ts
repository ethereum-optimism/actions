import type { Address, PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { decodeFunctionData } from 'viem'

import {
  DEFAULT_PERMIT2_EXPIRY_SECONDS,
  buildPermit2ApprovalTx,
  buildTokenApprovalTx,
  checkPermit2Allowance,
  checkTokenAllowance,
} from '../permit2.js'

const PERMIT2_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
] as const

const TOKEN = '0x1111111111111111111111111111111111111111' as Address
const OWNER = '0x2222222222222222222222222222222222222222' as Address
const SPENDER = '0x3333333333333333333333333333333333333333' as Address
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address

describe('checkPermit2Allowance', () => {
  it('returns parsed allowance data', async () => {
    const publicClient = {
      readContract: vi.fn().mockResolvedValue([
        1000000n, // amount (uint160)
        1700000000, // expiration (uint48)
        5, // nonce (uint48)
      ]),
    } as unknown as PublicClient

    const result = await checkPermit2Allowance({
      publicClient,
      permit2Address: PERMIT2,
      owner: OWNER,
      token: TOKEN,
      spender: SPENDER,
    })

    expect(result.amount).toBe(1000000n)
    expect(result.expiration).toBe(1700000000)
    expect(result.nonce).toBe(5)
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: PERMIT2,
        functionName: 'allowance',
        args: [OWNER, TOKEN, SPENDER],
      }),
    )
  })
})

describe('checkTokenAllowance', () => {
  it('returns token allowance as bigint', async () => {
    const publicClient = {
      readContract: vi.fn().mockResolvedValue(500000n),
    } as unknown as PublicClient

    const result = await checkTokenAllowance({
      publicClient,
      token: TOKEN,
      owner: OWNER,
      spender: SPENDER,
    })

    expect(result).toBe(500000n)
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TOKEN,
        functionName: 'allowance',
        args: [OWNER, SPENDER],
      }),
    )
  })
})

describe('buildTokenApprovalTx', () => {
  it('builds max approval to Permit2', () => {
    const tx = buildTokenApprovalTx(TOKEN, PERMIT2)

    expect(tx.to).toBe(TOKEN)
    expect(tx.value).toBe(0n)
    expect(tx.data).toMatch(/^0x/)
    // Should encode approve(permit2, maxUint256)
    expect(tx.data.length).toBeGreaterThan(10)
  })
})

describe('buildPermit2ApprovalTx', () => {
  it('approves exact amount with default expiry', () => {
    const before = Math.floor(Date.now() / 1000)
    const amount = 100000000n

    const tx = buildPermit2ApprovalTx({
      permit2Address: PERMIT2,
      token: TOKEN,
      spender: SPENDER,
      amount,
    })

    expect(tx.to).toBe(PERMIT2)
    expect(tx.value).toBe(0n)

    const decoded = decodeFunctionData({ abi: PERMIT2_ABI, data: tx.data })
    const [, , decodedAmount, expiration] = decoded.args
    expect(decodedAmount).toBe(amount)
    expect(Number(expiration)).toBeGreaterThanOrEqual(
      before + DEFAULT_PERMIT2_EXPIRY_SECONDS,
    )
  })

  it('uses custom expiry when provided', () => {
    const before = Math.floor(Date.now() / 1000)
    const customExpiry = 7 * 24 * 60 * 60 // 7 days

    const tx = buildPermit2ApprovalTx({
      permit2Address: PERMIT2,
      token: TOKEN,
      spender: SPENDER,
      amount: 100000000n,
      expirySeconds: customExpiry,
    })

    const decoded = decodeFunctionData({ abi: PERMIT2_ABI, data: tx.data })
    const [, , , expiration] = decoded.args
    expect(Number(expiration)).toBeGreaterThanOrEqual(before + customExpiry)
    expect(Number(expiration)).toBeLessThan(
      before + DEFAULT_PERMIT2_EXPIRY_SECONDS,
    )
  })
})
