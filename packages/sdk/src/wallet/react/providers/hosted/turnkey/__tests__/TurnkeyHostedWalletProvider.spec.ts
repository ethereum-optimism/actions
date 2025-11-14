import type { TurnkeySDKClientBase } from '@turnkey/react-wallet-kit'
import type { LocalAccount } from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { TurnkeyHostedWalletProvider } from '@/wallet/react/providers/hosted/turnkey/TurnkeyHostedWalletProvider.js'
import { TurnkeyWallet } from '@/wallet/react/wallets/hosted/turnkey/TurnkeyWallet.js'
import * as createSignerUtil from '@/wallet/react/wallets/hosted/turnkey/utils/createSigner.js'

describe('TurnkeyHostedWalletProvider', () => {
  const mockChainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager

  describe('toActionsWallet', () => {
    it('forwards params to TurnkeyWallet.create', async () => {
      const turnkeyClient = {} as unknown as TurnkeySDKClientBase
      const provider = new TurnkeyHostedWalletProvider(mockChainManager)
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
      const provider = new TurnkeyHostedWalletProvider(mockChainManager)
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
      const provider = new TurnkeyHostedWalletProvider(mockChainManager)
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
      const provider = new TurnkeyHostedWalletProvider(
        mockChainManager,
        { morpho: mockLendProvider },
      )
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
      const provider = new TurnkeyHostedWalletProvider(mockChainManager)
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
