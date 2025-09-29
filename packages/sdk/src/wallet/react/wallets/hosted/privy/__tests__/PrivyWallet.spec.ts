import { type ConnectedWallet, toViemAccount } from '@privy-io/react-auth'
import type { Address, LocalAccount, WalletClient } from 'viem'
import { createWalletClient } from 'viem'
import { toAccount } from 'viem/accounts'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { getRandomAddress } from '@/test/utils.js'
import { PrivyWallet } from '@/wallet/react/wallets/hosted/privy/PrivyWallet.js'

vi.mock('viem', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('viem')),
  createWalletClient: vi.fn(),
}))

vi.mock('viem/accounts', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('viem/accounts')),
  toAccount: vi.fn(),
}))

vi.mock('@privy-io/react-auth', () => ({
  toViemAccount: vi.fn(),
}))

describe('PrivyWallet (React)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  const mockAddress = getRandomAddress()
  const mockChainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager
  const mockLocalAccount = {
    address: mockAddress,
    signMessage: vi.fn(),
    sign: vi.fn(),
    signTransaction: vi.fn(),
    signTypedData: vi.fn(),
  } as unknown as LocalAccount

  it('initializes signer and address from Privy viem account', async () => {
    vi.mocked(toAccount).mockReturnValue(mockLocalAccount)
    const mockViemAccount = {
      address: mockAddress,
      sign: vi.fn(),
      signMessage: vi.fn(),
      signTransaction: vi.fn(),
      signTypedData: vi.fn(),
    } as any
    vi.mocked(toViemAccount).mockResolvedValue(mockViemAccount)
    const connectedWallet = {
      __brand: 'privy-connected-wallet',
    } as unknown as ConnectedWallet

    const wallet = await PrivyWallet.create({
      connectedWallet: connectedWallet,
      chainManager: mockChainManager,
    })

    expect(wallet.address).toBe(mockViemAccount.address)
    expect(toViemAccount).toHaveBeenCalledWith({
      wallet: connectedWallet,
    })
    expect(toAccount).toHaveBeenCalledWith({
      address: mockAddress,
      sign: mockViemAccount.sign,
      signMessage: mockViemAccount.signMessage,
      signTransaction: mockViemAccount.signTransaction,
      signTypedData: mockViemAccount.signTypedData,
    })
  })

  it('creates a WalletClient with correct configuration', async () => {
    vi.mocked(toAccount).mockReturnValue(mockLocalAccount)
    vi.mocked(toViemAccount).mockResolvedValue({
      address: mockAddress,
      sign: vi.fn(),
      signMessage: vi.fn(),
      signTransaction: vi.fn(),
      signTypedData: vi.fn(),
    } as any)
    const connectedWallet = {
      __brand: 'privy-connected-wallet',
    } as unknown as ConnectedWallet
    const wallet = await PrivyWallet.create({
      connectedWallet: connectedWallet,
      chainManager: mockChainManager,
    })

    const mockWalletClient = {
      account: mockLocalAccount,
      address: mockAddress as Address,
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
