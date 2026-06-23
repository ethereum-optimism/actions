import { base } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { assertFundingLanded, fundWallet } from '@/test/network/funding.js'

describe('assertFundingLanded', () => {
  it('passes when the balance moved by exactly the requested amount', () => {
    expect(() =>
      assertFundingLanded(1000n, 1000n + 1_234_000_000n, 1_234_000_000n),
    ).not.toThrow()
  })

  it('throws fail-loud when the balance did not move by the requested amount', () => {
    // The headline fund-safety property: a short/zero delta never passes
    // silently. Underfunded by 1 unit here.
    expect(() =>
      assertFundingLanded(0n, 1_233_999_999n, 1_234_000_000n),
    ).toThrow(/expected balance to increase by 1234000000, got 1233999999/)
  })

  it('throws when nothing landed at all (zero delta)', () => {
    expect(() => assertFundingLanded(500n, 500n, 1_000_000n)).toThrow(
      /USDC funding did not land/,
    )
  })
})

describe('fundWallet', () => {
  it('throws when USDC funding is requested for a chain with no whale entry', async () => {
    // `base` (8453) is intentionally absent from the per-chain whale map. The
    // whale lookup happens before any RPC call, so this fails loud (and offline)
    // rather than logging and proceeding against a zero balance.
    await expect(
      fundWallet({
        // Never contacted: the missing-whale guard throws first.
        rpcUrl: 'http://127.0.0.1:1',
        chain: base,
        targetAddress: '0x000000000000000000000000000000000000dEaD',
        fundUsdc: true,
      }),
    ).rejects.toThrow(/no USDC whale configured for chainId 8453/)
  })
})
