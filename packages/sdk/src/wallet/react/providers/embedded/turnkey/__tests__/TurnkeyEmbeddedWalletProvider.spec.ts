import type { TurnkeySDKClientBase } from '@turnkey/react-wallet-kit'
import type { LocalAccount } from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import { createMockLendProvider } from '@/lend/__mocks__/MockLendProvider.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { TurnkeyEmbeddedWalletProvider } from '@/wallet/react/providers/embedded/turnkey/TurnkeyEmbeddedWalletProvider.js'
import { TurnkeyWallet } from '@/wallet/react/wallets/embedded/turnkey/TurnkeyWallet.js'
import * as createSignerUtil from '@/wallet/react/wallets/embedded/turnkey/utils/createSigner.js'

describe('TurnkeyEmbeddedWalletProvider', () => {
  const mockChainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager

  describe('toActionsWallet', () => {
    it('forwards params to TurnkeyWallet.create', async () => {
      const turnkeyClient = {} as unknown as TurnkeySDKClientBase
      const provider = new TurnkeyEmbeddedWalletProvider(mockChainManager)
      const spyTurnkeyWalletCreate = vi
        .spyOn(TurnkeyWallet, 'create')
        .mockResolvedValueOnce({
          address: '0xabc',
        } as unknown as TurnkeyWallet)

      await provider.toActionsWallet({
        client: turnkeyClient,
        organizationId: 'org_123',
        signWith: 'key_abc',
      })

      expect(spyTurnkeyWalletCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          client: turnkeyClient,
          organizationId: 'org_123',
          signWith: 'key_abc',
          ethereumAddress: undefined,
          chainManager: mockChainManager,
        }),
      )
    })

    it('forwards ethereumAddress when provided', async () => {
      const turnkeyClient = {} as unknown as TurnkeySDKClientBase
      const provider = new TurnkeyEmbeddedWalletProvider(mockChainManager)
      const spyTurnkeyWalletCreate = vi
        .spyOn(TurnkeyWallet, 'create')
        .mockResolvedValueOnce({
          address: '0xabc',
        } as unknown as TurnkeyWallet)

      await provider.toActionsWallet({
        client: turnkeyClient,
        organizationId: 'org_123',
        signWith: 'key_abc',
        ethereumAddress: '0x123',
      })

      expect(spyTurnkeyWalletCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          client: turnkeyClient,
          organizationId: 'org_123',
          signWith: 'key_abc',
          ethereumAddress: '0x123',
          chainManager: mockChainManager,
        }),
      )
    })

    it('returns the created TurnkeyWallet instance', async () => {
      const turnkeyClient = {} as unknown as TurnkeySDKClientBase
      const provider = new TurnkeyEmbeddedWalletProvider(mockChainManager)
      const fakeWallet = {
        address: '0xabc',
      } as unknown as TurnkeyWallet
      vi.spyOn(TurnkeyWallet, 'create').mockResolvedValueOnce(fakeWallet)

      const actionsWallet = await provider.toActionsWallet({
        client: turnkeyClient,
        organizationId: 'org_123',
        signWith: 'key_abc',
      })

      expect(actionsWallet).toBe(fakeWallet)
    })

    it('forwards lendProvider when provided to constructor', async () => {
      const turnkeyClient = {} as unknown as TurnkeySDKClientBase
      const mockLendProvider = createMockLendProvider()
      const provider = new TurnkeyEmbeddedWalletProvider(mockChainManager, {
        morpho: mockLendProvider,
      })
      const spyTurnkeyWalletCreate = vi
        .spyOn(TurnkeyWallet, 'create')
        .mockResolvedValueOnce({
          address: '0xabc',
        } as unknown as TurnkeyWallet)

      await provider.toActionsWallet({
        client: turnkeyClient,
        organizationId: 'org_123',
        signWith: 'key_abc',
      })

      expect(spyTurnkeyWalletCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          lendProviders: { morpho: mockLendProvider },
        }),
      )
    })
  })

  describe('createSigner', () => {
    it('should delegate to createSigner utility with correct params', async () => {
      const provider = new TurnkeyEmbeddedWalletProvider(mockChainManager)
      const turnkeyClient = {} as unknown as TurnkeySDKClientBase

      const mockSigner = {
        address: '0xabc',
        type: 'local',
      } as unknown as LocalAccount

      const createSignerSpy = vi
        .spyOn(createSignerUtil, 'createSigner')
        .mockResolvedValueOnce(mockSigner)

      const params = {
        client: turnkeyClient,
        organizationId: 'org_123',
        signWith: 'key_abc',
      }

      const signer = await provider.createSigner(params)

      expect(createSignerSpy).toHaveBeenCalledWith(params)
      expect(signer).toBe(mockSigner)
    })
  })
})
