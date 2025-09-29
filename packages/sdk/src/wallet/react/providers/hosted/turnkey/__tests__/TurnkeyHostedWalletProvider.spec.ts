import type { TurnkeySDKClientBase } from '@turnkey/react-wallet-kit'
import { unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { TurnkeyHostedWalletProvider } from '@/wallet/react/providers/hosted/turnkey/TurnkeyHostedWalletProvider.js'
import { TurnkeyWallet } from '@/wallet/react/wallets/hosted/turnkey/TurnkeyWallet.js'

describe('TurnkeyHostedWalletProvider', () => {
  const mockChainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager

  it('forwards params to TurnkeyWallet.create', async () => {
    const turnkeyClient = {} as unknown as TurnkeySDKClientBase
    const provider = new TurnkeyHostedWalletProvider(mockChainManager)
    const spyTurnkeyWalletCreate = vi
      .spyOn(TurnkeyWallet, 'create')
      .mockResolvedValueOnce({
        address: '0xabc',
      } as unknown as TurnkeyWallet)

    await provider.toVerbsWallet({
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

    await provider.toVerbsWallet({
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

    const verbsWallet = await provider.toVerbsWallet({
      client: turnkeyClient,
      organizationId: 'org_123',
      signWith: 'key_abc',
    })

    expect(verbsWallet).toBe(fakeWallet)
  })
})
