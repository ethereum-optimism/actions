import type {
  SupportedChainId,
  SwapMarket,
  SwapPrice,
  SwapReceipt,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

import { getActions } from '../config/actions.js'
import { resolveAsset } from '../utils/assets.js'
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
  amountOut?: number
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
  const { tokenInAddress, tokenOutAddress, chainId, amountIn, amountOut } =
    params
  const actions = getActions()
  const assetIn = resolveAsset(tokenInAddress, chainId)
  const assetOut = resolveAsset(tokenOutAddress, chainId)

  return await actions.swap.price({
    assetIn,
    assetOut,
    chainId,
    ...(amountOut !== undefined ? { amountOut } : { amountIn: amountIn ?? 1 }),
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

    const assetIn = resolveAsset(tokenInAddress, chainId)
    const assetOut = resolveAsset(tokenOutAddress, chainId)

    const result = await wallet.swap.execute({
      amountIn,
      assetIn,
      assetOut,
      chainId,
      slippage,
    })

    // Extract transaction hash from nested receipt
    const receipt = result.receipt
    const transactionHash =
      'transactionHash' in receipt
        ? (receipt.transactionHash as string)
        : undefined
    const userOpHash =
      'userOpHash' in receipt ? (receipt.userOpHash as string) : undefined

    const blockExplorerUrls = getBlockExplorerUrls({
      chainId,
      transactionHash,
      userOpHash,
    })

    return {
      ...result,
      blockExplorerUrls,
    }
  } catch (error) {
    throw error
  }
}
