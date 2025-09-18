import { isEthereumWallet } from '@dynamic-labs/ethereum'
import type {
  Address,
  CustomSource,
  Hash,
  LocalAccount,
  WalletClient,
} from 'viem'
import { createWalletClient } from 'viem'
import { toAccount } from 'viem/accounts'
import { unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { getRandomAddress } from '@/test/utils.js'
import type { DynamicHostedWalletToVerbsWalletOptions } from '@/types/wallet.js'
import { DynamicWallet } from '@/wallet/DynamicWallet.js'

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

vi.mock('@dynamic-labs/ethereum', () => ({
  isEthereumWallet: vi.fn().mockReturnValue(true),
}))

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

function createMockDynamicWallet(): DynamicHostedWalletToVerbsWalletOptions['wallet'] {
  const mockConnector = {
    signRawMessage: vi.fn().mockResolvedValue('0xsigned'),
  }
  const mockWalletClient = {
    account: { address: mockAddress },
    signMessage: vi.fn(),
    signTransaction: vi.fn(),
    signTypedData: vi.fn(),
  } as unknown as WalletClient
  return {
    connector: mockConnector,
    getWalletClient: vi.fn().mockResolvedValue(mockWalletClient),
    __mock: { connector: mockConnector, walletClient: mockWalletClient },
  }
}

describe('DynamicWallet', () => {
  it('should initialize signer and address from dynamic wallet', async () => {
    const dynamic = createMockDynamicWallet()
    vi.mocked(toAccount).mockReturnValue(mockLocalAccount)

    const wallet = await DynamicWallet.create({
      dynamicWallet: dynamic,
      chainManager: mockChainManager,
    })

    expect(wallet.address).toBe(mockAddress)
    expect(dynamic.getWalletClient).toHaveBeenCalled()
  })

  it('should wire toAccount signer to connector.signRawMessage with 0x trim', async () => {
    const dynamic = createMockDynamicWallet()
    vi.mocked(toAccount).mockReturnValue(mockLocalAccount)

    await DynamicWallet.create({
      dynamicWallet: dynamic,
      chainManager: mockChainManager,
    })

    const calls = vi.mocked(toAccount).mock.calls
    const callArgs = calls[calls.length - 1][0] as CustomSource
    expect(callArgs.address).toBe(dynamic.__mock.walletClient.account.address)

    // Invoke the sign function and assert message formatting
    await callArgs.sign!({ hash: '0xdeadbeef' })
    expect(dynamic.__mock.connector.signRawMessage).toHaveBeenCalledWith({
      accountAddress: dynamic.__mock.walletClient.account.address,
      message: 'deadbeef',
    })

    await callArgs.sign!({ hash: 'cafebabe' as Hash })
    expect(dynamic.__mock.connector.signRawMessage).toHaveBeenCalledWith({
      accountAddress: dynamic.__mock.walletClient.account.address,
      message: 'cafebabe',
    })
  })

  it('should create a wallet client with correct configuration', async () => {
    const dynamic = createMockDynamicWallet()
    vi.mocked(toAccount).mockReturnValue(mockLocalAccount)

    const wallet = await DynamicWallet.create({
      dynamicWallet: dynamic,
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

  it('should throw if dynamic wallet is not EVM compatible', async () => {
    const dynamic = createMockDynamicWallet()
    // Force isEthereumWallet to return false for this test
    vi.mocked(isEthereumWallet).mockReturnValueOnce(false)

    try {
      await DynamicWallet.create({
        dynamicWallet: dynamic,
        chainManager: mockChainManager,
      })
    } catch (err) {
      expect((err as Error).message).toBe('Failed to initialize wallet')
      expect((err as any).cause?.message).toBe(
        'Wallet not connected or not EVM compatible',
      )
    }
  })
})
