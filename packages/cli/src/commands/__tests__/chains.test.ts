import { baseSepolia, optimismSepolia } from 'viem/chains'
import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runChains } from '@/commands/chains.js'
import * as baseCtx from '@/context/baseContext.js'

describe('runChains', () => {
  let writeSpy: MockInstance

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockConfig = (chains: unknown) => {
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: { chains } as never,
      actions: {} as never,
    })
  }

  it('emits chainId + shortname + rpcUrls per configured chain', async () => {
    mockConfig([
      { chainId: baseSepolia.id, rpcUrls: ['https://rpc.example'] },
      { chainId: optimismSepolia.id, rpcUrls: undefined },
    ])
    await runChains()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toEqual([
      {
        chainId: baseSepolia.id,
        shortname: 'base-sepolia',
        rpcUrls: ['https://rpc.example'],
      },
      {
        chainId: optimismSepolia.id,
        shortname: 'op-sepolia',
      },
    ])
  })

  it('emits an empty array when no chains are configured', async () => {
    mockConfig([])
    await runChains()
    expect(JSON.parse(String(writeSpy.mock.calls[0]?.[0]))).toEqual([])
  })
})
