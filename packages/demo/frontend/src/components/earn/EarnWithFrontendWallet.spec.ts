import { describe, expect, it, vi } from 'vitest'
import type {
  Asset,
  BorrowReceipt,
  SupportedChainId,
  SwapQuote,
  TransactionReturnType,
} from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

import {
  buildFrontendBorrowOperations,
  buildFrontendWalletOperations,
} from './frontendWalletOperations'
import { buildBorrowQuote } from '@/test-utils/borrowFixtures'
import { MorphoUSDCBorrowOPDemo } from '@/constants/markets'

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

const borrowMarketId = {
  kind: MorphoUSDCBorrowOPDemo.kind,
  marketId: MorphoUSDCBorrowOPDemo.marketId,
  chainId: MorphoUSDCBorrowOPDemo.chainId,
} as const

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
      walletAddress: '0x515f8fC39dD14AD674AdB305C51559b3d4fFc85a' as Address,
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
      address: walletQuote.walletAddress,
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

  it('routes borrow pricing and execution through the SDK namespaces for frontend wallets', async () => {
    const quote = buildBorrowQuote()
    const receipt = {
      action: 'open',
      marketId: borrowMarketId,
      receipt: {
        transactionHash:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      },
      transactionHash:
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    } satisfies BorrowReceipt

    const getQuote = vi.fn().mockResolvedValue(quote)
    const openPosition = vi.fn().mockResolvedValue(receipt)
    const wallet = {
      address: '0x515f8fC39dD14AD674AdB305C51559b3d4fFc85a' as Address,
      getBalance: vi.fn(),
      sendBatch: vi.fn<() => Promise<TransactionReturnType>>(),
      lend: {
        getPosition: vi.fn(),
        openPosition: vi.fn(),
        closePosition: vi.fn(),
      },
      borrow: {
        getPosition: vi.fn(),
        openPosition,
        closePosition: vi.fn(),
        depositCollateral: vi.fn(),
        withdrawCollateral: vi.fn(),
        repay: vi.fn(),
      },
      swap: {
        execute: vi.fn(),
        getQuote: vi.fn(),
      },
    }
    const actions = {
      lend: { getMarkets: vi.fn() },
      borrow: {
        getMarkets: vi.fn().mockResolvedValue([]),
        getQuote,
      },
      swap: {
        getMarkets: vi.fn(),
        getQuote: vi.fn(),
      },
      getSupportedAssets: vi.fn().mockReturnValue([assetIn, assetOut]),
    }

    const operations = buildFrontendBorrowOperations(wallet, actions)

    await operations.getQuote({
      action: 'open',
      marketId: borrowMarketId,
      borrowAmount: { amount: 5 },
      collateralAmount: { amount: 10 },
    })
    await operations.openPosition(wallet.address, {
      marketId: borrowMarketId,
      borrowAmount: { amount: 5 },
      collateralAmount: { amount: 10 },
    })

    expect(getQuote).toHaveBeenCalledWith({
      action: 'open',
      marketId: borrowMarketId,
      borrowAmount: { amount: 5 },
      collateralAmount: { amount: 10 },
      market: MorphoUSDCBorrowOPDemo,
      walletAddress: wallet.address,
    })
    expect(openPosition).toHaveBeenCalledWith({
      marketId: borrowMarketId,
      borrowAmount: { amount: 5 },
      collateralAmount: { amount: 10 },
      market: MorphoUSDCBorrowOPDemo,
      walletAddress: wallet.address,
    })
  })

  it('routes repay through wallet.borrow.repay with the wallet-bound address', async () => {
    const receipt = {
      action: 'repay',
      marketId: borrowMarketId,
      receipt: {
        transactionHash:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      },
      transactionHash:
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    } satisfies BorrowReceipt
    const repay = vi.fn().mockResolvedValue(receipt)
    const wallet = {
      address: '0x515f8fC39dD14AD674AdB305C51559b3d4fFc85a' as Address,
      getBalance: vi.fn(),
      sendBatch: vi.fn<() => Promise<TransactionReturnType>>(),
      lend: {
        getPosition: vi.fn(),
        openPosition: vi.fn(),
        closePosition: vi.fn(),
      },
      borrow: {
        getPosition: vi.fn(),
        openPosition: vi.fn(),
        closePosition: vi.fn(),
        depositCollateral: vi.fn(),
        withdrawCollateral: vi.fn(),
        repay,
      },
      swap: {
        execute: vi.fn(),
        getQuote: vi.fn(),
      },
    }
    const actions = {
      lend: { getMarkets: vi.fn() },
      borrow: {
        getMarkets: vi.fn().mockResolvedValue([]),
        getQuote: vi.fn(),
      },
      swap: {
        getMarkets: vi.fn(),
        getQuote: vi.fn(),
      },
      getSupportedAssets: vi.fn().mockReturnValue([assetIn, assetOut]),
    }

    const operations = buildFrontendBorrowOperations(wallet, actions)
    const result = await operations.repay(wallet.address, {
      marketId: borrowMarketId,
      amount: { amount: 3 },
    })

    expect(repay).toHaveBeenCalledWith({
      marketId: borrowMarketId,
      amount: { amount: 3 },
      market: MorphoUSDCBorrowOPDemo,
      walletAddress: wallet.address,
    })
    expect(result).toBe(receipt)
  })
})
