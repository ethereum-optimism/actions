import type {
  SupportedChainId,
  SwapMarket,
  SwapPrice,
  SwapReceipt,
} from '@eth-optimism/actions-sdk'
import { SUPPORTED_TOKENS } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

import { getActions } from '../config/actions.js'
import { getBlockExplorerUrls } from '../utils/explorers.js'
import { getWallet } from './wallet.js'

export interface SwapParams {
  idToken: string
  amountIn: number
  tokenInAddress: Address
  tokenOutAddress: Address
  chainId: SupportedChainId
  slippage?: number
}

export interface PriceParams {
  tokenInAddress: Address
  tokenOutAddress: Address
  chainId: SupportedChainId
  amountIn?: number
}

type SwapReceiptWithUrls = SwapReceipt & {
  blockExplorerUrls: string[]
}

export async function getMarkets(
  chainId?: SupportedChainId,
): Promise<SwapMarket[]> {
  const actions = getActions()
  return await actions.swap.getMarkets(chainId ? { chainId } : {})
}

export async function getPrice(params: PriceParams): Promise<SwapPrice> {
  const { tokenInAddress, tokenOutAddress, chainId, amountIn } = params
  const actions = getActions()

  const assetIn = SUPPORTED_TOKENS.find(
    (token) => token.address[chainId] === tokenInAddress,
  )
  const assetOut = SUPPORTED_TOKENS.find(
    (token) => token.address[chainId] === tokenOutAddress,
  )

  if (!assetIn) {
    throw new Error(`Asset not found for token address: ${tokenInAddress}`)
  }
  if (!assetOut) {
    throw new Error(`Asset not found for token address: ${tokenOutAddress}`)
  }

  return await actions.swap.price({
    assetIn,
    assetOut,
    chainId,
    amountIn: amountIn ?? 1,
  })
}

export async function executeSwap(
  params: SwapParams,
): Promise<SwapReceiptWithUrls> {
  const {
    idToken,
    amountIn,
    tokenInAddress,
    tokenOutAddress,
    chainId,
    slippage,
  } = params

  try {
    const wallet = await getWallet(idToken)
    if (!wallet) {
      throw new Error('Wallet not found')
    }

    if (!wallet.swap) {
      throw new Error('Swap not configured for this wallet')
    }

    const assetIn = SUPPORTED_TOKENS.find(
      (token) => token.address[chainId] === tokenInAddress,
    )
    const assetOut = SUPPORTED_TOKENS.find(
      (token) => token.address[chainId] === tokenOutAddress,
    )

    if (!assetIn) {
      throw new Error(`Asset not found for token address: ${tokenInAddress}`)
    }
    if (!assetOut) {
      throw new Error(`Asset not found for token address: ${tokenOutAddress}`)
    }

    const result = await wallet.swap.execute({
      amountIn,
      assetIn,
      assetOut,
      chainId,
      slippage,
    })

    const blockExplorerUrls = getBlockExplorerUrls({
      chainId,
      ...result,
    })

    return {
      ...result,
      blockExplorerUrls,
    }
  } catch (error) {
    console.error('[executeSwap] ERROR:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}
