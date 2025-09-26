import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { DynamicHostedWalletProvider } from '@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js'
import type { DynamicHostedWalletToVerbsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'

// Mock DynamicWallet module to avoid importing browser-related deps
vi.mock('@/wallet/react/wallets/hosted/dynamic/DynamicWallet.js', () => {
  const createSpy = vi.fn()
  return { DynamicWallet: { create: createSpy } }
})
const { DynamicWallet } = (await import(
  '@/wallet/react/wallets/hosted/dynamic/DynamicWallet.js'
)) as any

describe('DynamicHostedWalletProvider', () => {
  it('toVerbsWallet delegates to DynamicWallet.create with correct args', async () => {
    const mockChainManager = new MockChainManager({
      supportedChains: [1],
    }) as unknown as ChainManager
    const provider = new DynamicHostedWalletProvider(mockChainManager)

    const mockDynamicWallet = {
      __brand: 'dynamic-wallet',
    } as unknown as DynamicHostedWalletToVerbsWalletOptions['wallet']
    const mockResult = { __brand: 'verbs-wallet' }
    vi.mocked(DynamicWallet.create).mockResolvedValueOnce(mockResult)

    const result = await provider.toVerbsWallet({ wallet: mockDynamicWallet })

    expect(DynamicWallet.create).toHaveBeenCalledTimes(1)
    expect(DynamicWallet.create).toHaveBeenCalledWith({
      dynamicWallet: mockDynamicWallet,
      chainManager: mockChainManager,
    })
    expect(result).toBe(mockResult)
  })
})
