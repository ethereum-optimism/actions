import type { TurnkeySDKClientBase } from '@turnkey/core'
import type { TurnkeyClient as TurnkeyHttpClient } from '@turnkey/http'
import type { TurnkeyServerClient } from '@turnkey/sdk-server'
import { createAccount } from '@turnkey/viem'
import type { LocalAccount } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { getRandomAddress } from '@/test/utils.js'
import { createSigner } from '@/wallet/node/wallets/hosted/turnkey/utils/createSigner.js'

vi.mock('@turnkey/viem', async () => ({
  createAccount: vi.fn(),
}))

function createMockTurnkeyClient():
  | TurnkeyHttpClient
  | TurnkeyServerClient
  | TurnkeySDKClientBase {
  return {
    // minimal shape for typing; createAccount uses this via @turnkey/viem
  } as unknown as TurnkeyHttpClient
}

describe('createSigner (Node Turnkey)', () => {
  const mockAddress = getRandomAddress()

  it('should create a LocalAccount with correct configuration', async () => {
    const mockLocalAccount = {
      address: mockAddress,
      signMessage: vi.fn(),
      sign: vi.fn(),
      signTransaction: vi.fn(),
      signTypedData: vi.fn(),
    } as unknown as LocalAccount
    vi.mocked(createAccount).mockResolvedValue(mockLocalAccount)

    const client = createMockTurnkeyClient()
    const signer = await createSigner({
      client,
      organizationId: 'org_123',
      signWith: 'key_abc',
    })

    expect(createAccount).toHaveBeenCalledWith({
      client,
      organizationId: 'org_123',
      signWith: 'key_abc',
      ethereumAddress: undefined,
    })
    expect(signer).toBe(mockLocalAccount)
  })

  it('should pass ethereumAddress when provided', async () => {
    const mockLocalAccount = {
      address: mockAddress,
      type: 'local',
    } as unknown as LocalAccount
    vi.mocked(createAccount).mockResolvedValue(mockLocalAccount)

    const client = createMockTurnkeyClient()
    const ethereumAddress = getRandomAddress()
    const signer = await createSigner({
      client,
      organizationId: 'org_123',
      signWith: 'key_abc',
      ethereumAddress,
    })

    expect(createAccount).toHaveBeenCalledWith({
      client,
      organizationId: 'org_123',
      signWith: 'key_abc',
      ethereumAddress,
    })
    expect(signer).toBe(mockLocalAccount)
  })
})
