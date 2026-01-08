import type { Address } from 'viem'
import { getAddress } from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import {
  createMockPrivyClient,
  createMockPrivyWallet,
  getMockAuthorizationContext,
} from '@/__mocks__/MockPrivyClient.js'
import { getRandomAddress } from '@/__mocks__/utils.js'
import { createMockLendProvider } from '@/lend/__mocks__/MockLendProvider.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
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
      const provider = new PrivyHostedWalletProvider({
        privyClient: privy,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
      })

      const hostedWallet = createMockPrivyWallet()

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
      const authorizationContext = getMockAuthorizationContext()
      const provider = new PrivyHostedWalletProvider({
        privyClient: privy,
        authorizationContext,
        chainManager: mockChainManager,
      })
      const spy = vi.spyOn(PrivyWallet, 'create')

      const id = 'mock-wallet-123'
      const addr = getRandomAddress()

      await provider.toActionsWallet({ walletId: id, address: addr })

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          privyClient: privy,
          authorizationContext,
          walletId: id,
          address: getAddress(addr),
          chainManager: mockChainManager,
        }),
      )
    })

    it('throws on invalid address', async () => {
      const privy = createMockPrivyClient('app', 'secret')
      const provider = new PrivyHostedWalletProvider({
        privyClient: privy,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
      })

      await expect(
        provider.toActionsWallet({ walletId: 'id', address: '0x123' }),
      ).rejects.toBeTruthy()
    })

    it('forwards lendProvider when provided to constructor', async () => {
      const privy = createMockPrivyClient('app', 'secret')
      const mockLendProvider = createMockLendProvider()
      const provider = new PrivyHostedWalletProvider({
        privyClient: privy,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
        lendProviders: { morpho: mockLendProvider },
      })
      const spy = vi.spyOn(PrivyWallet, 'create')

      const id = 'mock-wallet-123'
      const addr = getRandomAddress()

      await provider.toActionsWallet({
        walletId: id,
        address: addr,
      })

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          lendProviders: { morpho: mockLendProvider },
        }),
      )
    })
  })

  describe('createSigner', () => {
    it('should create a LocalAccount with correct address', async () => {
      const privy = createMockPrivyClient('app', 'secret')
      const provider = new PrivyHostedWalletProvider({
        privyClient: privy,
        authorizationContext: getMockAuthorizationContext(),
        chainManager: mockChainManager,
      })

      const hostedWallet = createMockPrivyWallet()

      const signer = await provider.createSigner({
        walletId: hostedWallet.id,
        address: hostedWallet.address,
      })

      expect(signer.address).toBe(hostedWallet.address)
      expect(signer.type).toBe('local')
    })
  })
})
