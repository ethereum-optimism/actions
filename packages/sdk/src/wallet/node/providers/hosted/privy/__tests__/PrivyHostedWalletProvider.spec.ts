import type { Address } from 'viem'
import { getAddress } from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { getRandomAddress } from '@/test/utils.js'
import type { LendConfig, LendProvider } from '@/types/lend/index.js'
import { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
import { PrivyWallet } from '@/wallet/node/wallets/hosted/privy/PrivyWallet.js'

describe('PrivyHostedWalletProvider', () => {
  const mockChainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager

  describe('toActionsWallet', () => {
    it('toActionsWallet creates an ActionsWallet with correct address and signer', async () => {
      const privy = createMockPrivyClient('app', 'secret')
      const provider = new PrivyHostedWalletProvider(privy, mockChainManager)

      const hostedWallet = await privy.walletApi.createWallet({
        chainType: 'ethereum',
      })

      const actionsWallet = await provider.toActionsWallet({
        walletId: hostedWallet.id,
        address: hostedWallet.address as Address,
      })

      expect(actionsWallet).toBeInstanceOf(Wallet)
      expect(actionsWallet.address).toBe(hostedWallet.address)
      expect(actionsWallet.signer.address).toBe(hostedWallet.address)
    })

    it('forwards params to PrivyWallet.create', async () => {
      const privy = createMockPrivyClient('app', 'secret')
      const provider = new PrivyHostedWalletProvider(privy, mockChainManager)
      const spy = vi.spyOn(PrivyWallet, 'create')

      const id = 'mock-wallet-123'
      const addr = getRandomAddress().toLowerCase()

      await provider.toActionsWallet({ walletId: id, address: addr as Address })

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
        provider.toActionsWallet({ walletId: 'id', address: '0x123' }),
      ).rejects.toBeTruthy()
    })

    it('forwards lendProvider when provided to constructor', async () => {
      const privy = createMockPrivyClient('app', 'secret')
      const mockLendProvider = {} as LendProvider<LendConfig>
      const provider = new PrivyHostedWalletProvider(
        privy,
        mockChainManager,
        mockLendProvider,
      )
      const spy = vi.spyOn(PrivyWallet, 'create')

      const id = 'mock-wallet-123'
      const addr = getRandomAddress().toLowerCase()

      await provider.toActionsWallet({
        walletId: id,
        address: addr as Address,
      })

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          lendProvider: mockLendProvider,
        }),
      )
    })
  })

  describe('createSigner', () => {
    it('should create a LocalAccount with correct address', async () => {
      const privy = createMockPrivyClient('app', 'secret')
      const provider = new PrivyHostedWalletProvider(privy, mockChainManager)

      const hostedWallet = await privy.walletApi.createWallet({
        chainType: 'ethereum',
      })

      const signer = await provider.createSigner({
        walletId: hostedWallet.id,
        address: hostedWallet.address as Address,
      })

      expect(signer.address).toBe(hostedWallet.address)
      expect(signer.type).toBe('local')
    })
  })
})
