import type {
  Asset,
  SupportedChainId,
  TransactionReturnType,
} from '@eth-optimism/actions-sdk/react'
import type { Address, Hex } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { actionsApi } from '@/api/actionsApi'

import { mintDemoAsset } from './demoAssetMinting'

vi.mock('@/api/actionsApi', () => ({
  actionsApi: {
    dripEthToFrontendWallet: vi.fn(),
  },
}))

const CHAIN_ID: SupportedChainId = 11155420
const OWNER: Address = '0x1111111111111111111111111111111111111111'
const WALLET: Address = '0x2222222222222222222222222222222222222222'
const SIGNATURE: Hex = `0x${'3'.repeat(130)}`
const NOW = 1_800_000_000_000
const ETH: Asset = {
  type: 'native',
  address: { [CHAIN_ID]: 'native' },
  metadata: { decimals: 18, name: 'Ether', symbol: 'ETH' },
}

describe('mintDemoAsset', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('authenticates an ETH drip with the frontend wallet owner', async () => {
    const signMessage = vi.fn().mockResolvedValue(SIGNATURE)
    const wallet = {
      address: WALLET,
      sendBatch: vi.fn<() => Promise<TransactionReturnType>>(),
      signer: { address: OWNER, signMessage },
    }

    await mintDemoAsset(wallet, ETH)

    expect(signMessage).toHaveBeenCalledWith({
      message: [
        'actions-demo:eth-faucet:v1',
        `chainId=${CHAIN_ID}`,
        `owner=${OWNER}`,
        `wallet=${WALLET}`,
        `issuedAt=${NOW}`,
      ].join('\n'),
    })
    expect(actionsApi.dripEthToFrontendWallet).toHaveBeenCalledWith({
      issuedAt: NOW,
      ownerAddress: OWNER,
      signature: SIGNATURE,
      walletAddress: WALLET,
    })
  })
})
