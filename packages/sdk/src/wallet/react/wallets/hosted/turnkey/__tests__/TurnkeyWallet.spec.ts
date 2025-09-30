import type { TurnkeySDKClientBase } from '@turnkey/react-wallet-kit'
import { createAccount } from '@turnkey/viem'
import type { LocalAccount, WalletClient } from 'viem'
import { createWalletClient } from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { getRandomAddress } from '@/test/utils.js'
import { TurnkeyWallet } from '@/wallet/react/wallets/hosted/turnkey/TurnkeyWallet.js'

vi.mock('viem', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('viem')),
  createWalletClient: vi.fn(),
}))

vi.mock('@turnkey/viem', async () => ({
  createAccount: vi.fn(),
}))

const mockAddress = getRandomAddress()
const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager

function createMockTurnkeyClient(): TurnkeySDKClientBase {
  return {
    // minimal shape for typing; createAccount uses this via @turnkey/viem
  } as unknown as TurnkeySDKClientBase
}

describe('TurnkeyWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize signer and address from Turnkey account', async () => {
    const mockLocalAccount = { address: mockAddress } as unknown as LocalAccount
    vi.mocked(createAccount).mockResolvedValue(mockLocalAccount)

    const wallet = await TurnkeyWallet.create({
      client: createMockTurnkeyClient(),
      organizationId: 'org_123',
      signWith: 'key_abc',
      chainManager: mockChainManager,
    })

    expect(wallet.address).toBe(mockAddress)
    expect(wallet.signer).toBe(mockLocalAccount)
    expect(createAccount).toHaveBeenCalledOnce()
    const args = vi.mocked(createAccount).mock.calls[0][0]
    expect(args.client).toEqual(createMockTurnkeyClient())
    expect(args.organizationId).toBe('org_123')
    expect(args.signWith).toBe('key_abc')
    expect(args.ethereumAddress).toBeUndefined()
  })

  it('takes ethereumAddress', async () => {
    const mockLocalAccount = { address: mockAddress } as unknown as LocalAccount
    vi.mocked(createAccount).mockResolvedValue(mockLocalAccount)

    await TurnkeyWallet.create({
      client: createMockTurnkeyClient(),
      organizationId: 'org_123',
      signWith: 'key_abc',
      ethereumAddress: '0x123',
      chainManager: mockChainManager,
    })

    const args = vi.mocked(createAccount).mock.calls[0][0]
    expect(args.ethereumAddress).toBe('0x123')
  })

  it('should create a wallet client with correct configuration', async () => {
    const mockLocalAccount = { address: mockAddress } as unknown as LocalAccount
    vi.mocked(createAccount).mockResolvedValue(mockLocalAccount)
    const wallet = await TurnkeyWallet.create({
      client: createMockTurnkeyClient(),
      organizationId: 'org_123',
      signWith: 'key_abc',
      chainManager: mockChainManager,
    })
    const mockWalletClient = {
      account: mockLocalAccount,
      address: mockAddress,
    } as unknown as WalletClient
    vi.mocked(createWalletClient).mockResolvedValue(mockWalletClient)

    const walletClient = await wallet.walletClient(unichain.id)

    expect(createWalletClient).toHaveBeenCalledOnce()
    const args = vi.mocked(createWalletClient).mock.calls[0][0]
    expect(args.account).toBe(mockLocalAccount)
    expect(args.chain).toBe(mockChainManager.getChain(unichain.id))
    expect(walletClient).toBe(mockWalletClient)
  })
})
