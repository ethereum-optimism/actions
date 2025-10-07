import type { LocalAccount } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import type { LendConfig, LendProvider } from '@/types/lend/index.js'
import { DynamicHostedWalletProvider } from '@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js'
import type { DynamicHostedWalletToActionsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'
import { DynamicWallet } from '@/wallet/react/wallets/hosted/dynamic/DynamicWallet.js'
import * as createSignerUtil from '@/wallet/react/wallets/hosted/dynamic/utils/createSigner.js'

// Mock DynamicWallet to avoid importing browser-related deps
vi.mock('@/wallet/react/wallets/hosted/dynamic/DynamicWallet.js', async () => {
  const { DynamicWalletMock } = await import(
    '@/wallet/react/wallets/hosted/dynamic/__mocks__/DynamicWalletMock.js'
  )
  return { DynamicWallet: DynamicWalletMock }
})

describe('DynamicHostedWalletProvider', () => {
  describe('toActionsWallet', () => {
    it('toActionsWallet delegates to DynamicWallet.create with correct args', async () => {
      const mockChainManager = new MockChainManager({
        supportedChains: [1],
      }) as unknown as ChainManager
      const provider = new DynamicHostedWalletProvider(mockChainManager)

      const mockDynamicWallet = {
        __brand: 'dynamic-wallet',
      } as unknown as DynamicHostedWalletToActionsWalletOptions['wallet']
      const mockResult = {
        __brand: 'actions-wallet',
      } as unknown as DynamicWallet
      vi.mocked(DynamicWallet.create).mockResolvedValueOnce(mockResult)

      const result = await provider.toActionsWallet({
        wallet: mockDynamicWallet,
      })

      expect(DynamicWallet.create).toHaveBeenCalledTimes(1)
      expect(DynamicWallet.create).toHaveBeenCalledWith({
        dynamicWallet: mockDynamicWallet,
        chainManager: mockChainManager,
      })
      expect(result).toBe(mockResult)
    })

    it('forwards lendProvider when provided to constructor', async () => {
      const mockChainManager = new MockChainManager({
        supportedChains: [1],
      }) as unknown as ChainManager
      const mockLendProvider = {} as any
      const provider = new DynamicHostedWalletProvider(
        mockChainManager,
        mockLendProvider as LendProvider<LendConfig>,
      )

      const mockDynamicWallet = {
        __brand: 'dynamic-wallet',
      } as unknown as DynamicHostedWalletToActionsWalletOptions['wallet']
      const mockResult = { __brand: 'actions-wallet' }
      vi.mocked(DynamicWallet.create).mockResolvedValueOnce(mockResult)

      await provider.toActionsWallet({
        wallet: mockDynamicWallet,
      })

      expect(DynamicWallet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lendProvider: mockLendProvider,
        }),
      )
    })
  })

  describe('createSigner', () => {
    it('should delegate to createSigner utility with correct params', async () => {
      const mockChainManager = new MockChainManager({
        supportedChains: [1],
      }) as unknown as ChainManager
      const provider = new DynamicHostedWalletProvider(mockChainManager)

      const mockDynamicWallet = {
        __brand: 'dynamic-wallet',
      } as unknown as DynamicHostedWalletToActionsWalletOptions['wallet']

      const mockSigner = {
        address: '0xabc',
        type: 'local',
      } as unknown as LocalAccount

      const createSignerSpy = vi
        .spyOn(createSignerUtil, 'createSigner')
        .mockResolvedValueOnce(mockSigner)

      const params = { wallet: mockDynamicWallet }
      const signer = await provider.createSigner(params)

      expect(createSignerSpy).toHaveBeenCalledWith(params)
      expect(signer).toBe(mockSigner)
    })
  })
})
