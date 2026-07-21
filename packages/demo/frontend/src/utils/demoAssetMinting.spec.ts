import type {
  Asset,
  SupportedChainId,
  TransactionReturnType,
} from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { actionsApi } from '@/api/actionsApi'

import { mintDemoAsset } from './demoAssetMinting'

vi.mock('@/api/actionsApi', () => ({
  actionsApi: {
    dripEthToWallet: vi.fn(),
  },
}))

const CHAIN_ID: SupportedChainId = 11155420
const OWNER: Address = '0x1111111111111111111111111111111111111111'
const WALLET: Address = '0x2222222222222222222222222222222222222222'
const ETH: Asset = {
  type: 'native',
  address: { [CHAIN_ID]: 'native' },
  metadata: { decimals: 18, name: 'Ether', symbol: 'ETH' },
}

describe('mintDemoAsset', () => {
  it('requests ETH without asking the frontend wallet to sign', async () => {
    const signMessage = vi.fn()
    const wallet = {
      address: WALLET,
      sendBatch: vi.fn<() => Promise<TransactionReturnType>>(),
      signer: { address: OWNER, signMessage },
    }

    await mintDemoAsset(wallet, ETH)

    expect(signMessage).not.toHaveBeenCalled()
    expect(actionsApi.dripEthToWallet).toHaveBeenCalledWith(WALLET)
  })
})
