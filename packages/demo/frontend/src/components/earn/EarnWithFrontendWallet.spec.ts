import { describe, expect, it, vi } from 'vitest'
import type {
  Asset,
  SupportedChainId,
  SwapQuote,
  TransactionReturnType,
} from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

import { buildFrontendWalletOperations } from './EarnWithFrontendWallet'

const CHAIN_ID = 84532 as SupportedChainId
const TOKEN_IN = '0x1111111111111111111111111111111111111111' as Address
const TOKEN_OUT = '0x2222222222222222222222222222222222222222' as Address

const assetIn: Asset = {
  type: 'erc20',
  address: { [CHAIN_ID]: TOKEN_IN },
  metadata: {
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
  },
}

const assetOut: Asset = {
  type: 'erc20',
  address: { [CHAIN_ID]: TOKEN_OUT },
  metadata: {
    decimals: 18,
    name: 'Optimism',
    symbol: 'OP',
  },
}

describe('buildFrontendWalletOperations', () => {
  it('quotes swaps through wallet.swap.getQuote so the recipient is bound to the wallet', async () => {
    const walletQuote = {
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

    const walletGetQuote = vi.fn().mockResolvedValue(walletQuote)
    const actionsGetQuote = vi.fn()
    const wallet = {
      address: walletQuote.recipient,
      getBalance: vi.fn(),
      sendBatch: vi.fn<() => Promise<TransactionReturnType>>(),
      lend: {
        getPosition: vi.fn(),
        openPosition: vi.fn(),
        closePosition: vi.fn(),
      },
      swap: {
        execute: vi.fn(),
        getQuote: walletGetQuote,
      },
    }
    const actions = {
      lend: { getMarkets: vi.fn() },
      swap: {
        getMarkets: vi.fn(),
        getQuote: actionsGetQuote,
      },
      getSupportedAssets: vi.fn().mockReturnValue([assetIn, assetOut]),
    }

    const operations = buildFrontendWalletOperations(wallet, actions)

    const result = await operations.getSwapQuote({
      tokenInAddress: TOKEN_IN,
      tokenOutAddress: TOKEN_OUT,
      chainId: CHAIN_ID,
      amountIn: 10,
      provider: 'uniswap',
    })

    expect(result).toEqual(walletQuote)
    expect(walletGetQuote).toHaveBeenCalledWith({
      assetIn,
      assetOut,
      chainId: CHAIN_ID,
      amountIn: 10,
      amountOut: undefined,
      provider: 'uniswap',
    })
    expect(actionsGetQuote).not.toHaveBeenCalled()
  })
})
