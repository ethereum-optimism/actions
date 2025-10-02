import type { ConnectedWallet } from '@privy-io/react-auth'
import { toViemAccount } from '@privy-io/react-auth'
import type { LocalAccount } from 'viem'
import { toAccount } from 'viem/accounts'
import { describe, expect, it, vi } from 'vitest'

import { getRandomAddress } from '@/test/utils.js'
import { createSigner } from '@/wallet/react/wallets/hosted/privy/utils/createSigner.js'

vi.mock('@privy-io/react-auth', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('@privy-io/react-auth')),
  toViemAccount: vi.fn(),
}))

vi.mock('viem/accounts', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('viem/accounts')),
  toAccount: vi.fn(),
}))

describe('createSigner', () => {
  const mockAddress = getRandomAddress()

  it('should create a LocalAccount with correct configuration', async () => {
    const mockConnectedWallet = {
      address: mockAddress,
      walletClientType: 'privy',
    } as unknown as ConnectedWallet

    const mockPrivyViemAccount = {
      address: mockAddress,
      sign: vi.fn(),
      signMessage: vi.fn(),
      signTransaction: vi.fn(),
      signTypedData: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof toViemAccount>>

    const mockLocalAccount = {
      address: mockAddress,
      sign: vi.fn(),
      signMessage: vi.fn(),
      signTransaction: vi.fn(),
      signTypedData: vi.fn(),
    } as unknown as LocalAccount

    vi.mocked(toViemAccount).mockResolvedValue(mockPrivyViemAccount)
    vi.mocked(toAccount).mockReturnValue(mockLocalAccount)

    const signer = await createSigner({
      connectedWallet: mockConnectedWallet,
    })

    expect(toViemAccount).toHaveBeenCalledWith({
      wallet: mockConnectedWallet,
    })
    expect(toAccount).toHaveBeenCalledWith({
      address: mockPrivyViemAccount.address,
      sign: mockPrivyViemAccount.sign,
      signMessage: mockPrivyViemAccount.signMessage,
      signTransaction: mockPrivyViemAccount.signTransaction,
      signTypedData: mockPrivyViemAccount.signTypedData,
    })
    expect(signer).toBe(mockLocalAccount)
  })
})
