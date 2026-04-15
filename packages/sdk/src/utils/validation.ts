import type { Address } from 'viem'
import { isAddress } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import { isAssetSupportedOnChain } from '@/utils/assets.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function validateAmountProvided(
  amountIn?: number,
  amountOut?: number,
): void {
  if (amountIn === undefined && amountOut === undefined) {
    throw new Error('Either amountIn or amountOut must be provided')
  }
}

export function validateAmountPositiveIfExists(amount?: number): void {
  if (amount !== undefined && amount <= 0) {
    throw new Error('Amount must be positive')
  }
}

export function validateNotBothAmounts(
  amountIn?: number,
  amountOut?: number,
): void {
  if (amountIn !== undefined && amountOut !== undefined) {
    throw new Error('Provide either amountIn or amountOut, not both')
  }
}

export function validateNotSameAsset(assetIn: Asset, assetOut: Asset): void {
  if (
    assetIn.metadata.symbol.toLowerCase() ===
    assetOut.metadata.symbol.toLowerCase()
  ) {
    throw new Error('Cannot swap an asset for itself')
  }
}

export function validateNotZeroAddress(address: Address, label: string): void {
  if (address === ZERO_ADDRESS) {
    throw new Error(`${label} cannot be the zero address`)
  }
}

export function validateSlippage(slippage: number, maxSlippage: number): void {
  if (slippage < 0 || slippage > maxSlippage) {
    throw new Error(
      `Slippage ${slippage} exceeds allowed range [0, ${maxSlippage * 100}%]`,
    )
  }
}

export function validateChainSupported(
  chainId: number,
  supportedChainIds: readonly number[],
): void {
  if (!supportedChainIds.includes(chainId)) {
    throw new Error(
      `Chain ${chainId} is not supported. Supported chains: ${supportedChainIds.join(', ')}`,
    )
  }
}

export function validateAssetOnChain(
  asset: Asset,
  chainId: SupportedChainId,
): void {
  if (!isAssetSupportedOnChain(asset, chainId)) {
    throw new Error(
      `Asset ${asset.metadata.symbol} not supported on chain ${chainId}`,
    )
  }
}

/**
 * Validate that a resolved recipient address is not the zero address.
 * ENS names are skipped — only resolved `Address` values are checked.
 */
export function validateRecipient(recipient: string | undefined): void {
  if (recipient && isAddress(recipient)) {
    validateNotZeroAddress(recipient as Address, 'recipient')
  }
}
