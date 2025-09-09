import { getAddress } from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { getRandomAddress } from '@/test/utils.js'
import { Wallet } from '@/wallet/base/Wallet.js'
import { PrivyWallet } from '@/wallet/PrivyWallet.js'
import { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'

describe('PrivyHostedWalletProvider', () => {
  const mockChainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager

  it('toVerbsWallet creates a VerbsWallet with correct address and signer', async () => {
    const privy = createMockPrivyClient('app', 'secret')
    const provider = new PrivyHostedWalletProvider(privy, mockChainManager)

    const hostedWallet = await privy.walletApi.createWallet({
      chainType: 'ethereum',
    })

    const verbsWallet = await provider.toVerbsWallet({
      walletId: hostedWallet.id,
      address: hostedWallet.address,
    })

    expect(verbsWallet).toBeInstanceOf(Wallet)
    expect(verbsWallet.address).toBe(hostedWallet.address)
    expect(verbsWallet.signer.address).toBe(hostedWallet.address)
  })

  it('forwards params to PrivyWallet.create', async () => {
    const privy = createMockPrivyClient('app', 'secret')
    const provider = new PrivyHostedWalletProvider(privy, mockChainManager)
    const spy = vi.spyOn(PrivyWallet, 'create')

    const id = 'mock-wallet-123'
    const addr = getRandomAddress().toLowerCase()

    await provider.toVerbsWallet({ walletId: id, address: addr })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        privyClient: privy,
        walletId: id,
        address: getAddress(addr),
        chainManager: mockChainManager,
      }),
    )
  })

  it('throws on invalid address', async () => {
    const privy = createMockPrivyClient('app', 'secret')
    const provider = new PrivyHostedWalletProvider(privy, mockChainManager)

    await expect(
      provider.toVerbsWallet({ walletId: 'id', address: '0x123' }),
    ).rejects.toBeTruthy()
  })
})
