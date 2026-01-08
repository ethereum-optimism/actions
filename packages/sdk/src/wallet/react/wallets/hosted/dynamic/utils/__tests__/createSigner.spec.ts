import { isEthereumWallet } from '@dynamic-labs/ethereum'
import type { DynamicWaasEVMConnector } from '@dynamic-labs/waas-evm'
import type { Wallet } from '@dynamic-labs/wallet-connector-core'
import type { LocalAccount, WalletClient } from 'viem'
import { toAccount } from 'viem/accounts'
import { describe, expect, it, vi } from 'vitest'

import { getRandomAddress } from '@/__mocks__/utils.js'
import { createSigner } from '@/wallet/react/wallets/hosted/dynamic/utils/createSigner.js'

vi.mock('@dynamic-labs/ethereum', async () => ({
  isEthereumWallet: vi.fn(),
}))

vi.mock('viem/accounts', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('viem/accounts')),
  toAccount: vi.fn(),
}))

describe('createSigner (React Dynamic)', () => {
  const mockAddress = getRandomAddress()

  it('should create a LocalAccount with correct configuration', async () => {
    const mockWalletClient = {
      account: {
        address: mockAddress,
      },
      signMessage: vi.fn(),
      signTransaction: vi.fn(),
      signTypedData: vi.fn(),
    } as unknown as WalletClient

    const mockConnector = {
      signRawMessage: vi.fn(),
    } as unknown as DynamicWaasEVMConnector

    const mockWallet = {
      getWalletClient: vi.fn().mockResolvedValue(mockWalletClient),
      connector: mockConnector,
    } as unknown as Wallet

    const mockLocalAccount = {
      address: mockAddress,
      sign: vi.fn(),
      signMessage: vi.fn(),
      signTransaction: vi.fn(),
      signTypedData: vi.fn(),
    } as unknown as LocalAccount

    vi.mocked(isEthereumWallet).mockReturnValue(true)
    vi.mocked(toAccount).mockReturnValue(mockLocalAccount)

    const signer = await createSigner({
      wallet: mockWallet,
    })

    expect(isEthereumWallet).toHaveBeenCalledWith(mockWallet)
    expect(mockWallet.getWalletClient).toHaveBeenCalled()
    expect(toAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        address: mockAddress,
        signMessage: mockWalletClient.signMessage,
        signTransaction: mockWalletClient.signTransaction,
        signTypedData: mockWalletClient.signTypedData,
      }),
    )
    expect(signer).toBe(mockLocalAccount)
  })

  it('should throw error for non-Ethereum wallet', async () => {
    const mockWallet = {} as unknown as Wallet

    vi.mocked(isEthereumWallet).mockReturnValue(false)

    await expect(
      createSigner({
        wallet: mockWallet,
      }),
    ).rejects.toThrow('Wallet not connected or not EVM compatible')
  })
})
