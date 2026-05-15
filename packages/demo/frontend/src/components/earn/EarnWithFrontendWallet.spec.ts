import { describe, expect, it, vi } from 'vitest'
import type {
  Asset,
  BorrowPrice,
  BorrowReceipt,
  SupportedChainId,
  SwapQuote,
  TransactionReturnType,
} from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'

import {
  buildFrontendBorrowOperations,
  buildFrontendWalletOperations,
} from './EarnWithFrontendWallet'
import { MorphoBorrowDemo } from '@/constants/markets'

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
  kind: MorphoBorrowDemo.kind,
  marketId: MorphoBorrowDemo.marketId,
  chainId: MorphoBorrowDemo.chainId,
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

  it('routes borrow pricing and execution through the SDK namespaces for frontend wallets', async () => {
    const price = {
      marketId: borrowMarketId,
      action: 'open',
      positionAfter: {
        marketId: borrowMarketId,
        collateralAsset: assetIn,
        collateralAmount: 10_000_000n,
        collateralAmountFormatted: '10',
        borrowAsset: assetOut,
        borrowAmount: 5_000_000_000_000_000_000n,
        borrowAmountFormatted: '5',
        healthFactor: 1.8,
        liquidationPrice: 1_000_000n,
        liquidationPriceFormatted: '1',
        borrowApy: 0.05,
        liquidationBonus: 0.05,
        ltv: 0.5,
        maxLtv: 0.86,
      },
      fees: [],
      safeCeilingLtv: 0.81,
    } satisfies BorrowPrice
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

    const getPrice = vi.fn().mockResolvedValue(price)
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
        getPrice,
        getQuote: vi.fn(),
      },
      swap: {
        getMarkets: vi.fn(),
        getQuote: vi.fn(),
      },
      getSupportedAssets: vi.fn().mockReturnValue([assetIn, assetOut]),
    }

    const operations = buildFrontendBorrowOperations(wallet, actions)

    await operations.getPrice({
      action: 'open',
      marketId: borrowMarketId,
      walletAddress: wallet.address,
      borrowAmount: { amount: 5 },
      collateralAmount: { amount: 10 },
    })
    await operations.openPosition(wallet.address, {
      marketId: borrowMarketId,
      borrowAmount: { amount: 5 },
      collateralAmount: { amount: 10 },
    })

    expect(getPrice).toHaveBeenCalledWith({
      action: 'open',
      marketId: borrowMarketId,
      walletAddress: wallet.address,
      borrowAmount: { amount: 5 },
      collateralAmount: { amount: 10 },
      market: MorphoBorrowDemo,
    })
    expect(openPosition).toHaveBeenCalledWith({
      marketId: borrowMarketId,
      borrowAmount: { amount: 5 },
      collateralAmount: { amount: 10 },
      market: MorphoBorrowDemo,
      walletAddress: wallet.address,
    })
  })
})
