import type {
  SupportedChainId,
  SwapMarket,
  SwapPrice,
  SwapReceipt,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

import { getActions } from '@/config/actions.js'
import { getWallet } from '@/services/wallet.js'
import { resolveAsset } from '@/utils/assets.js'
import { getBlockExplorerUrls } from '@/utils/explorers.js'

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
  const assets = actions.getSupportedAssets()
  const assetIn = resolveAsset(tokenInAddress, chainId, assets)
  const assetOut = resolveAsset(tokenOutAddress, chainId, assets)

  return await actions.swap.price({
    assetIn,
    assetOut,
    chainId,
    amountIn,
    amountOut,
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

  const wallet = await getWallet(idToken)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  if (!wallet.swap) {
    throw new Error('Swap not configured for this wallet')
  }

  const actions = getActions()
  const assets = actions.getSupportedAssets()
  const assetIn = resolveAsset(tokenInAddress, chainId, assets)
  const assetOut = resolveAsset(tokenOutAddress, chainId, assets)

  const result = await wallet.swap.execute({
    amountIn,
    assetIn,
    assetOut,
    chainId,
    slippage,
  })

  const receipt = result.receipt
  const blockExplorerUrls = getBlockExplorerUrls({
    chainId,
    ...(!Array.isArray(receipt) ? receipt : {}),
  })

  return {
    ...result,
    blockExplorerUrls,
  }
}
