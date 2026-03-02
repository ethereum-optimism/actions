import type { Address, PublicClient } from 'viem'
import { maxUint160, maxUint256 } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import {
  buildPermit2ApprovalTx,
  buildTokenApprovalTx,
  checkPermit2Allowance,
  checkTokenAllowance,
} from '../permit2.js'

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
  it('builds Permit2 approval for spender', () => {
    const tx = buildPermit2ApprovalTx({
      permit2Address: PERMIT2,
      token: TOKEN,
      spender: SPENDER,
    })

    expect(tx.to).toBe(PERMIT2)
    expect(tx.value).toBe(0n)
    expect(tx.data).toMatch(/^0x/)
    expect(tx.data.length).toBeGreaterThan(10)
  })
})
