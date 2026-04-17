import type { LocalAccount } from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { getRandomAddress } from '@/__mocks__/utils.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { LocalWalletProvider } from '@/wallet/node/providers/local/LocalWalletProvider.js'

const mockAddress = getRandomAddress()
const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager

function createMockLocalAccount(): LocalAccount {
  return { address: mockAddress } as unknown as LocalAccount
}

describe('LocalWalletProvider', () => {
  it('should return a Wallet from toActionsWallet', async () => {
    const provider = new LocalWalletProvider({ chainManager: mockChainManager })
    const account = createMockLocalAccount()

    const wallet = await provider.toActionsWallet({ account })

    expect(wallet.address).toBe(mockAddress)
    expect(wallet.signer).toBe(account)
  })

  it('should return the same LocalAccount from createSigner', async () => {
    const provider = new LocalWalletProvider({ chainManager: mockChainManager })
    const account = createMockLocalAccount()

    const signer = await provider.createSigner({ account })

    expect(signer).toBe(account)
  })
})
