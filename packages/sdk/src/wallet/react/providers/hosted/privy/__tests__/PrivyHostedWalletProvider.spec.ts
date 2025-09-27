import type { ConnectedWallet } from '@privy-io/react-auth'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { PrivyHostedWalletProvider } from '@/wallet/react/providers/hosted/privy/PrivyHostedWalletProvider.js'
import { PrivyWallet } from '@/wallet/react/wallets/hosted/privy/PrivyWallet.js'

// Mock PrivyWallet to avoid importing browser-related deps
vi.mock('@/wallet/react/wallets/hosted/privy/PrivyWallet.js', async () => {
  const { PrivyWalletMock } = await import(
    '@/wallet/react/wallets/hosted/privy/__mocks__/PrivyWalletMock.js'
  )
  return { PrivyWallet: PrivyWalletMock }
})

describe('PrivyHostedWalletProvider (React)', () => {
  it('toVerbsWallet delegates to PrivyWallet.create with correct args', async () => {
    const mockChainManager = new MockChainManager({
      supportedChains: [1],
    }) as unknown as ChainManager
    const provider = new PrivyHostedWalletProvider(mockChainManager)
    const mockVerbsWallet = {
      __brand: 'verbs-wallet',
    } as unknown as PrivyWallet
    const mockConnectedWallet = {
      __brand: 'privy-connected-wallet',
    } as unknown as ConnectedWallet
    vi.mocked(PrivyWallet.create).mockResolvedValueOnce(mockVerbsWallet)

    const result = await provider.toVerbsWallet({
      connectedWallet: mockConnectedWallet,
    })

    expect(PrivyWallet.create).toHaveBeenCalledTimes(1)
    expect(PrivyWallet.create).toHaveBeenCalledWith({
      chainManager: mockChainManager,
      connectedWallet: mockConnectedWallet,
    })
    expect(result).toBe(mockVerbsWallet)
  })
})
