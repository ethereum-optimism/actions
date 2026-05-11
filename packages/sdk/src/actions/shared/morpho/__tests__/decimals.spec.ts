import type { PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { resolveUnderlyingDecimals } from '@/actions/shared/morpho/decimals.js'

describe('resolveUnderlyingDecimals', () => {
  it('returns allowlist decimals without touching the RPC', async () => {
    const publicClient = {
      readContract: vi.fn(),
    } as unknown as PublicClient
    const decimals = await resolveUnderlyingDecimals({
      publicClient,
      vaultAddress: '0x0000000000000000000000000000000000000abc',
      allowlistDecimals: 6,
    })
    expect(decimals).toBe(6)
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })

  it('falls back to vault.asset() + underlying.decimals() when allowlist misses', async () => {
    const underlying = '0x000000000000000000000000000000000000beef'
    const readContract = vi
      .fn()
      .mockResolvedValueOnce(underlying) // vault.asset()
      .mockResolvedValueOnce(18) // underlying.decimals()
    const publicClient = { readContract } as unknown as PublicClient

    const decimals = await resolveUnderlyingDecimals({
      publicClient,
      vaultAddress: '0x000000000000000000000000000000000000cafe',
    })

    expect(decimals).toBe(18)
    expect(readContract).toHaveBeenCalledTimes(2)
    const firstCall = readContract.mock.calls[0][0]
    const secondCall = readContract.mock.calls[1][0]
    expect(firstCall).toMatchObject({ functionName: 'asset' })
    expect(secondCall).toMatchObject({
      address: underlying,
      functionName: 'decimals',
    })
  })
})
