import type {
  SupportedChainId,
  SwapMarket,
  SwapPrice,
  SwapProviderName,
  SwapQuote,
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
  provider?: SwapProviderName
}

export interface PriceParams {
  tokenInAddress: Address
  tokenOutAddress: Address
  chainId: SupportedChainId
  amountIn?: number
  amountOut?: number
  provider?: SwapProviderName
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
  const {
    tokenInAddress,
    tokenOutAddress,
    chainId,
    amountIn,
    amountOut,
    provider,
  } = params
  const actions = getActions()
  const assetIn = resolveAsset(tokenInAddress, chainId)
  const assetOut = resolveAsset(tokenOutAddress, chainId)

  return await actions.swap.price({
    assetIn,
    assetOut,
    chainId,
    amountIn,
    amountOut,
    provider,
  })
}

export async function getQuote(params: PriceParams): Promise<SwapQuote> {
  const {
    tokenInAddress,
    tokenOutAddress,
    chainId,
    amountIn,
    amountOut,
    provider,
  } = params
  const actions = getActions()
  const assetIn = resolveAsset(tokenInAddress, chainId)
  const assetOut = resolveAsset(tokenOutAddress, chainId)

  return await actions.swap.getQuote({
    assetIn,
    assetOut,
    chainId,
    amountIn,
    amountOut,
    provider,
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
    provider,
  } = params

  const wallet = await getWallet(idToken)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  if (!wallet.swap) {
    throw new Error('Swap not configured for this wallet')
  }

  const assetIn = resolveAsset(tokenInAddress, chainId)
  const assetOut = resolveAsset(tokenOutAddress, chainId)

  let result
  try {
    result = await wallet.swap.execute({
      amountIn,
      assetIn,
      assetOut,
      chainId,
      slippage,
      provider,
    })
  } catch (err) {
    console.error('[swap] execute failed:', {
      provider,
      assetIn: assetIn.metadata.symbol,
      assetOut: assetOut.metadata.symbol,
      amountIn,
      chainId,
      error: err instanceof Error ? err.message : err,
    })
    throw err
  }

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
