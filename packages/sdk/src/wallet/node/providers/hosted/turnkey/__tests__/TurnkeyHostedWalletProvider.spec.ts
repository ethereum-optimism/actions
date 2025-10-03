import type { TurnkeyClient } from '@turnkey/http'
import type { LocalAccount } from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { TurnkeyHostedWalletProvider } from '@/wallet/node/providers/hosted/turnkey/TurnkeyHostedWalletProvider.js'
import { TurnkeyWallet } from '@/wallet/node/wallets/hosted/turnkey/TurnkeyWallet.js'
import * as createSignerUtil from '@/wallet/node/wallets/hosted/turnkey/utils/createSigner.js'

describe('TurnkeyHostedWalletProvider', () => {
  const mockChainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager

  describe('toActionsWallet', () => {
    it('forwards params to TurnkeyWallet.create', async () => {
      const turnkeyClient = {} as unknown as TurnkeyClient
      const provider = new TurnkeyHostedWalletProvider(
        turnkeyClient,
        mockChainManager,
      )
      const spyTurnkeyWalletCreate = vi
        .spyOn(TurnkeyWallet, 'create')
        .mockResolvedValueOnce({
          address: '0xabc',
        } as unknown as TurnkeyWallet)

      await provider.toActionsWallet({
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
      const turnkeyClient = {} as unknown as TurnkeyClient
      const provider = new TurnkeyHostedWalletProvider(
        turnkeyClient,
        mockChainManager,
      )
      const spyTurnkeyWalletCreate = vi
        .spyOn(TurnkeyWallet, 'create')
        .mockResolvedValueOnce({
          address: '0xabc',
        } as unknown as TurnkeyWallet)

      await provider.toActionsWallet({
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
      const turnkeyClient = {} as unknown as TurnkeyClient
      const provider = new TurnkeyHostedWalletProvider(
        turnkeyClient,
        mockChainManager,
      )
      const fakeWallet = {
        address: '0xabc',
      } as unknown as TurnkeyWallet
      vi.spyOn(TurnkeyWallet, 'create').mockResolvedValueOnce(fakeWallet)

      const actionsWallet = await provider.toActionsWallet({
        organizationId: 'org_123',
        signWith: 'key_abc',
      })

      expect(actionsWallet).toBe(fakeWallet)
    })
  })

  describe('createSigner', () => {
    it('should delegate to createSigner utility with correct params', async () => {
      const turnkeyClient = {} as unknown as TurnkeyClient
      const provider = new TurnkeyHostedWalletProvider(
        turnkeyClient,
        mockChainManager,
      )
      const mockSigner = {
        address: '0xabc',
        type: 'local',
      } as unknown as LocalAccount
      const createSignerSpy = vi
        .spyOn(createSignerUtil, 'createSigner')
        .mockResolvedValueOnce(mockSigner)

      const params = {
        organizationId: 'org_123',
        signWith: 'key_abc',
      }

      const signer = await provider.createSigner(params)

      expect(createSignerSpy).toHaveBeenCalledWith({
        client: turnkeyClient,
        organizationId: 'org_123',
        signWith: 'key_abc',
      })
      expect(signer).toBe(mockSigner)
    })

    it('should forward ethereumAddress when provided', async () => {
      const turnkeyClient = {} as unknown as TurnkeyClient
      const provider = new TurnkeyHostedWalletProvider(
        turnkeyClient,
        mockChainManager,
      )
      const mockSigner = {
        address: '0x123',
        type: 'local',
      } as unknown as LocalAccount
      const createSignerSpy = vi
        .spyOn(createSignerUtil, 'createSigner')
        .mockResolvedValueOnce(mockSigner)

      const params = {
        organizationId: 'org_123',
        signWith: 'key_abc',
        ethereumAddress: '0x123',
      }

      await provider.createSigner(params)

      expect(createSignerSpy).toHaveBeenCalledWith({
        client: turnkeyClient,
        organizationId: 'org_123',
        signWith: 'key_abc',
        ethereumAddress: '0x123',
      })
    })
  })
})
