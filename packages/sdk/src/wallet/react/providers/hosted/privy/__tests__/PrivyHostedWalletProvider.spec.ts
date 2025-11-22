import type { ConnectedWallet } from '@privy-io/react-auth'
import type { LocalAccount } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import type { LendConfig, LendProvider } from '@/types/lend/index.js'
import { PrivyHostedWalletProvider } from '@/wallet/react/providers/hosted/privy/PrivyHostedWalletProvider.js'
import { PrivyWallet } from '@/wallet/react/wallets/hosted/privy/PrivyWallet.js'
import * as createSignerUtil from '@/wallet/react/wallets/hosted/privy/utils/createSigner.js'

// Mock PrivyWallet to avoid importing browser-related deps
vi.mock('@/wallet/react/wallets/hosted/privy/PrivyWallet.js', async () => {
  const { PrivyWalletMock } = await import(
    '@/wallet/react/wallets/hosted/privy/__mocks__/PrivyWalletMock.js'
  )
  return { PrivyWallet: PrivyWalletMock }
})

describe('PrivyHostedWalletProvider (React)', () => {
  describe('toActionsWallet', () => {
    it('toActionsWallet delegates to PrivyWallet.create with correct args', async () => {
      const mockChainManager = new MockChainManager({
        supportedChains: [1],
      }) as unknown as ChainManager
      const provider = new PrivyHostedWalletProvider(mockChainManager)
      const mockActionsWallet = {
        __brand: 'actions-wallet',
      } as unknown as PrivyWallet
      const mockConnectedWallet = {
        __brand: 'privy-connected-wallet',
      } as unknown as ConnectedWallet
      vi.mocked(PrivyWallet.create).mockResolvedValueOnce(mockActionsWallet)

      const result = await provider.toActionsWallet({
        connectedWallet: mockConnectedWallet,
      })

      expect(PrivyWallet.create).toHaveBeenCalledTimes(1)
      expect(PrivyWallet.create).toHaveBeenCalledWith({
        chainManager: mockChainManager,
        connectedWallet: mockConnectedWallet,
      })
      expect(result).toBe(mockActionsWallet)
    })

    it('forwards lendProvider when provided to constructor', async () => {
      const mockChainManager = new MockChainManager({
        supportedChains: [1],
      }) as unknown as ChainManager
      const mockLendProvider = {} as any
      const provider = new PrivyHostedWalletProvider(
        mockChainManager,
        mockLendProvider as LendProvider<LendConfig>,
      )
      const mockActionsWallet = {
        __brand: 'actions-wallet',
      } as unknown as PrivyWallet
      const mockConnectedWallet = {
        __brand: 'privy-connected-wallet',
      } as unknown as ConnectedWallet
      vi.mocked(PrivyWallet.create).mockResolvedValueOnce(mockActionsWallet)

      await provider.toActionsWallet({
        connectedWallet: mockConnectedWallet,
      })

      expect(PrivyWallet.create).toHaveBeenCalledWith(
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
      const provider = new PrivyHostedWalletProvider(mockChainManager)

      const mockConnectedWallet = {
        __brand: 'privy-connected-wallet',
      } as unknown as ConnectedWallet

      const mockSigner = {
        address: '0xabc',
        type: 'local',
      } as unknown as LocalAccount

      const createSignerSpy = vi
        .spyOn(createSignerUtil, 'createSigner')
        .mockResolvedValueOnce(mockSigner)

      const params = { connectedWallet: mockConnectedWallet }
      const signer = await provider.createSigner(params)

      expect(createSignerSpy).toHaveBeenCalledWith(params)
      expect(signer).toBe(mockSigner)
    })
  })
})
