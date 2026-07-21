import type {
  Asset,
  SupportedChainId,
  SwapQuote,
} from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { actionsApi } from '@/api/actionsApi'

import {
  buildMintOperation,
  buildSwapOperations,
} from './serverWalletOperations'

vi.mock('@/api/actionsApi', () => ({
  actionsApi: {
    dripEthToWallet: vi.fn(),
    executeSwap: vi.fn(),
    getAssets: vi.fn(),
    getSwapMarkets: vi.fn(),
    getSwapQuote: vi.fn(),
  },
}))

const CHAIN_ID = 84532 as SupportedChainId
const TOKEN_IN = '0x1111111111111111111111111111111111111111' as Address
const TOKEN_OUT = '0x2222222222222222222222222222222222222222' as Address
const WALLET = '0x3333333333333333333333333333333333333333' as Address

const assetIn: Asset = {
  type: 'erc20',
  address: { [CHAIN_ID]: TOKEN_IN },
  metadata: { decimals: 6, name: 'USD Coin', symbol: 'USDC' },
}

const assetOut: Asset = {
  type: 'erc20',
  address: { [CHAIN_ID]: TOKEN_OUT },
  metadata: { decimals: 18, name: 'Optimism', symbol: 'OP' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildSwapOperations', () => {
  it('executes server-wallet swaps from quote params, not the preview quote', async () => {
    vi.mocked(actionsApi.executeSwap).mockResolvedValue({
      amountIn: 10,
      amountOut: 5,
      price: '0.5',
      priceImpact: 0.01,
      blockExplorerUrls: ['https://explorer.example/tx/0xabc'],
    })

    const quote = {
      assetIn,
      assetOut,
      chainId: CHAIN_ID,
      amountIn: 10,
      amountInRaw: 10_000_000n,
      amountOut: 5,
      amountOutRaw: 5_000_000_000_000_000_000n,
      amountOutMin: 4.9,
      amountOutMinRaw: 4_900_000_000_000_000_000n,
      price: 0.5,
      priceImpact: 0.01,
      slippage: 0.005,
      deadline: 1_700_000_000,
      recipient: '0x515f8fC39dD14AD674AdB305C51559b3d4fFc85a' as Address,
      provider: 'uniswap',
      quotedAt: 1_700_000_000,
      expiration: 1_700_000_060,
      execution: {
        routerAddress: '0x3333333333333333333333333333333333333333' as Address,
        swapCalldata: '0x1234',
        value: 0n,
      },
    } satisfies SwapQuote

    const operations = buildSwapOperations(async () => ({
      Authorization: 'Bearer test-token',
    }))

    const result = await operations.executeSwap(quote)

    expect(result).toEqual({
      blockExplorerUrl: 'https://explorer.example/tx/0xabc',
    })
    expect(actionsApi.executeSwap).toHaveBeenCalledWith(
      {
        amountIn: 10,
        tokenInAddress: TOKEN_IN,
        tokenOutAddress: TOKEN_OUT,
        chainId: CHAIN_ID,
        provider: 'uniswap',
      },
      { Authorization: 'Bearer test-token' },
    )
  })
})

describe('buildMintOperation', () => {
  it('requests ETH without fetching provider authentication', async () => {
    const getAuthHeaders = vi.fn()
    const mintAsset = buildMintOperation(getAuthHeaders, WALLET)
    const eth: Asset = {
      type: 'native',
      address: { [CHAIN_ID]: 'native' },
      metadata: { decimals: 18, name: 'Ether', symbol: 'ETH' },
    }

    await mintAsset(eth)

    expect(actionsApi.dripEthToWallet).toHaveBeenCalledWith(WALLET)
    expect(getAuthHeaders).not.toHaveBeenCalled()
  })
})
