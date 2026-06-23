import { base } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { fundWallet } from '@/test/network/funding.js'

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
